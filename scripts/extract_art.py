"""
Cut the game art out of the print-and-cut kit PDF into web assets under public/art/.

    python scripts/extract_art.py [path/to/Broken_Grimoire_Cutouts_A4.pdf]

Needs PyMuPDF and Pillow (pip install pymupdf pillow). Every crop below is in PDF points and comes
from the kit's own layout (cards on a 3x3 grid, tokens on an 85pt pitch, map tiles of 32 mm = 90.71pt),
so if the kit is re-exported with the same layout this script just needs to be re-run.
"""

import glob
import io
import os
import sys

import pymupdf
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'art')
R = pymupdf.Rect


def find_pdf() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    found = sorted(glob.glob(os.path.join(ROOT, 'Broken_Grimoire_Cutouts_A4*.pdf')))
    if not found:
        sys.exit('No Broken_Grimoire_Cutouts_A4*.pdf in the project root; pass the path as an argument.')
    return found[-1]


def render(page: pymupdf.Page, clip: pymupdf.Rect, px_per_pt: float) -> Image.Image:
    pix = page.get_pixmap(matrix=pymupdf.Matrix(px_per_pt, px_per_pt), clip=clip, alpha=False)
    return Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')


def save(img: Image.Image, rel: str, **opts) -> None:
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if rel.endswith('.jpg'):
        img.convert('RGB').save(path, 'JPEG', quality=opts.get('quality', 86), optimize=True, progressive=True)
    else:
        img.save(path, 'PNG', optimize=True)
    print(f'  {rel}  {img.width}x{img.height}  {os.path.getsize(path) // 1024} KB')


# ---------------------------------------------------------------- cards

CARD_COLS = [29.8, 208.3, 386.9, 565.5]
CARD_ROWS = [46.8, 296.2, 545.7, 795.1]

# (page, row, col) -> file name. Pages 3–4 of the kit: starting deck, then Cross ×2, loot and the potion.
CARDS = {
    (3, 0, 0): 'fire',
    (3, 1, 0): 'water',
    (3, 1, 2): 'rock',
    (3, 2, 1): 'beam',
    (4, 0, 0): 'cross',
    (4, 0, 2): 'rock-loot',
    (4, 1, 1): 'fire-loot',
    (4, 1, 2): 'beam-loot',
    (4, 2, 1): 'water-loot',
    (4, 2, 2): 'potion',
    (2, 0, 0): 'back',
}


def cards(doc: pymupdf.Document) -> None:
    print('cards')
    for (page, row, col), name in CARDS.items():
        clip = R(CARD_COLS[col], CARD_ROWS[row], CARD_COLS[col + 1], CARD_ROWS[row + 1])
        save(render(doc[page - 1], clip, 2.0), f'cards/{name}.jpg')


# Enemy reference cards (page 5, 2 columns × 4 rows) and the wizard's character card (page 9).
REF_COLS = [48.2, 297.6, 547.1]
REF_ROWS = [63.8, 242.4, 420.9, 599.5, 778.1]
REF_ORDER = ['rat', 'archer', 'brute', 'leech', 'warden', 'ward', 'scrap', 'redactor']


def reference_cards(doc: pymupdf.Document) -> None:
    print('reference cards')
    for i, name in enumerate(REF_ORDER):
        row, col = divmod(i, 2)
        clip = R(REF_COLS[col], REF_ROWS[row], REF_COLS[col + 1], REF_ROWS[row + 1])
        save(render(doc[4], clip, 2.0), f'reference/{name}.jpg')
    save(render(doc[8], R(34.0, 635.0, 283.5, 813.5), 2.0), 'reference/wizard.jpg')


# ---------------------------------------------------------------- fragment icons

# Raster art on the fragment cards, keyed by the image's position on page 3/4 (its alpha lives in a soft mask).
ICONS = {(3, 91, 119): 'fire', (3, 91, 369): 'water', (3, 448, 369): 'rock', (3, 241, 619): 'beam', (4, 62, 120): 'cross', (4, 448, 618): 'potion'}


def icons(doc: pymupdf.Document) -> None:
    print('icons')
    for (page, x, y), name in ICONS.items():
        p = doc[page - 1]
        for info in p.get_images(full=True):
            xref, smask = info[0], info[1]
            if any(abs(r.x0 - x) < 3 and abs(r.y0 - y) < 3 for r in p.get_image_rects(xref)):
                pix = pymupdf.Pixmap(doc, xref)
                if smask:
                    pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
                img = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGBA')
                img.thumbnail((256, 256), Image.LANCZOS)
                save(img, f'icons/{name}.png')
                break
        else:
            sys.exit(f'icon {name} not found on page {page}')


# ---------------------------------------------------------------- tokens (page 6)

TOKEN_PITCH = 85.04
TOKEN_X0, TOKEN_Y0 = 85.05, 90.75
TOKEN_R = 36.6
TOKENS = {
    'you': (0, 0),
    'rat': (0, 1),
    'archer': (0, 4),
    'brute': (1, 0),
    'leech': (1, 2),
    'warden': (1, 4),
    'ward-fire': (1, 5),
    'ward-water': (2, 0),
    'ward-rock': (2, 1),
    'scrap': (2, 2),
    'redactor': (3, 4),
}


def circle_cut(img: Image.Image) -> Image.Image:
    """Round token: everything outside the ring becomes transparent (supersampled edge)."""
    s = 4
    mask = Image.new('L', (img.width * s, img.height * s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, img.width * s - 1, img.height * s - 1), fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask.resize(img.size, Image.LANCZOS))
    return out


def tokens(doc: pymupdf.Document) -> None:
    print('tokens')
    size = 168  # px across
    for name, (row, col) in TOKENS.items():
        cx, cy = TOKEN_X0 + col * TOKEN_PITCH, TOKEN_Y0 + row * TOKEN_PITCH
        clip = R(cx - TOKEN_R, cy - TOKEN_R, cx + TOKEN_R, cy + TOKEN_R)
        save(circle_cut(render(doc[5], clip, size / (2 * TOKEN_R))), f'tokens/{name}.png')

    # Status tokens (bottom of the sheet): rounded squares, one per status.
    print('status tokens')
    for name, x0, y0 in [('burn', 150.2, 691.7), ('root', 354.3, 691.7), ('stun', 252.3, 742.7)]:
        side = 39.7
        img = render(doc[5], R(x0, y0, x0 + side, y0 + side), 96 / side).convert('RGBA')
        mask = Image.new('L', (img.width * 4, img.height * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width * 4 - 1, img.height * 4 - 1), radius=img.width * 4 // 9, fill=255)
        img.putalpha(mask.resize(img.size, Image.LANCZOS))
        save(img, f'status/{name}.png')


# ---------------------------------------------------------------- maps (pages 10–15)

TILE = 90.71  # 32 mm
FRAME = 9.9  # map frame around the floor, in points
MAP_PX_PER_TILE = 150

# room id -> (left sheet page, right sheet page, floor rect on the left sheet, columns on the left sheet, grid size)
MAPS = {
    'cistern': (10, 11, R(272.1, 148.8, 816.4, 693.1), 3, 6),
    'scriptorium': (12, 13, R(272.1, 148.8, 816.4, 693.1), 3, 6),
    'redactor': (14, 15, R(181.4, 58.1, 907.1, 783.8), 4, 8),
}


def seam_line(page: pymupdf.Page, x: float) -> tuple[tuple[int, int, int], float, float]:
    """Colour, width and opacity of the grid line the two sheets are joined on (the widest line drawn there)."""
    lines = [
        dr
        for dr in page.get_drawings()
        if abs(dr['rect'].x0 - x) < 0.2 and abs(dr['rect'].x1 - x) < 0.2 and dr['rect'].height > 300 and dr.get('color') and dr.get('width')
    ]
    if not lines:
        return (74, 66, 48), 1.7, 0.85
    best = max(lines, key=lambda dr: dr['width'])
    return tuple(round(c * 255) for c in best['color']), best['width'], best.get('stroke_opacity') or 1.0


def maps(doc: pymupdf.Document) -> None:
    """Stitch each room's two A4 sheets back into one board, framed, with pillars / start / exit art baked in."""
    print('maps')
    scale = MAP_PX_PER_TILE / TILE
    for room, (lp, rp, floor, left_cols, n) in MAPS.items():
        seam_x = floor.x0 + left_cols * TILE
        top, bottom = floor.y0 - FRAME, floor.y1 + FRAME
        left = render(doc[lp - 1], R(floor.x0 - FRAME, top, seam_x, bottom), scale)
        # Same floor on the right sheet, shifted left by the sheet offset.
        shift = doc[rp - 1].get_image_rects(doc[rp - 1].get_images()[0][0])[0].x0 - floor.x0
        right = render(doc[rp - 1], R(seam_x + shift, top, floor.x1 + FRAME + shift, bottom), scale)
        board = Image.new('RGB', (left.width + right.width, max(left.height, right.height)))
        board.paste(left, (0, 0))
        board.paste(right, (left.width, 0))
        # Repaint the seam's grid line (the glue tab and the trim line sit right on it).
        color, width, opacity = seam_line(doc[lp - 1], seam_x)
        w = max(1, round(width * scale))
        y0, y1 = round(FRAME * scale), round((FRAME + n * TILE) * scale)
        line = Image.new('RGBA', board.size, (0, 0, 0, 0))
        ImageDraw.Draw(line).rectangle((left.width - w // 2, y0, left.width + (w - w // 2) - 1, y1), fill=(*color, round(opacity * 255)))
        board = Image.alpha_composite(board.convert('RGBA'), line).convert('RGB')
        # The trim line also crosses the frame: patch it with the frame just left of the seam.
        sx = left.width
        for band in ((0, y0), (y1 + 1, board.height)):
            patch = board.crop((sx - 8, band[0], sx - 4, band[1]))
            board.paste(patch, (sx - 2, band[0]))
        save(board, f'maps/{room}.jpg', quality=84)

    # The Cistern's open exit tile, laid over the Scriptorium's locked exit once the Warden falls.
    lp, rp, floor, left_cols, n = MAPS['cistern']
    page = doc[rp - 1]
    shift = page.get_image_rects(page.get_images()[0][0])[0].x0 - floor.x0
    x0 = floor.x0 + 5 * TILE + shift
    save(render(page, R(x0, floor.y0, x0 + TILE, floor.y0 + TILE), scale), 'maps/exit-open.jpg')


def main() -> None:
    pdf = find_pdf()
    print(f'Reading {os.path.relpath(pdf, ROOT)} -> {os.path.relpath(OUT, ROOT)}')
    doc = pymupdf.open(pdf)
    cards(doc)
    reference_cards(doc)
    icons(doc)
    tokens(doc)
    maps(doc)


if __name__ == '__main__':
    main()
