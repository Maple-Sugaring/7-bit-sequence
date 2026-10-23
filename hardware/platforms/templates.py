"""1:1 drilling templates as PDF: an overview page plus four letter-size tiles."""
from collections import Counter

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

import params as P
from parts import HALF, HOLE_D, HOLE_TYPES

PAGE_W, PAGE_H = letter
MARGIN = 10
TILE = HALF + 2 * MARGIN  # each tile shows a quadrant plus 10 mm past the centre lines and edges


def _panel_lines(c, tx, ty, s):
    """Panel outline, centre lines and diagonals in plan coordinates."""
    c.setLineWidth(0.6)
    c.setDash()
    c.rect(tx(-HALF), ty(-HALF), HALF * 2 * s, HALF * 2 * s)
    c.setLineWidth(0.3)
    c.setDash(4, 3)
    c.line(tx(-HALF), ty(0), tx(HALF), ty(0))
    c.line(tx(0), ty(-HALF), tx(0), ty(HALF))
    c.line(tx(-HALF), ty(-HALF), tx(HALF), ty(HALF))
    c.line(tx(-HALF), ty(HALF), tx(HALF), ty(-HALF))
    c.setDash()


def _outlines(c, tx, ty, s, outlines, font):
    """Dashed grey part outlines and labels, for orientation only (no holes)."""
    c.setLineWidth(0.3)
    c.setStrokeGray(0.55)
    c.setFillGray(0.45)
    c.setFont("Helvetica", font)
    for shape in outlines:
        kind = shape[0]
        c.setDash(2, 2)
        if kind == "rect":
            _, x0, y0, x1, y1, label = shape
            c.rect(tx(x0), ty(y0), (x1 - x0) * s, (y1 - y0) * s)
            if label:
                c.drawCentredString(tx((x0 + x1) / 2), ty(y1) - font - 2, label)
        elif kind == "circle":
            _, x, y, r, label = shape
            c.circle(tx(x), ty(y), r * s)
        elif kind == "poly":
            _, pts, label = shape
            p = c.beginPath()
            p.moveTo(tx(pts[0][0]), ty(pts[0][1]))
            for x, y in pts[1:]:
                p.lineTo(tx(x), ty(y))
            p.close()
            c.drawPath(p, stroke=1, fill=0)
            if label:
                cx = sum(x for x, _ in pts) / len(pts)
                cy = sum(y for _, y in pts) / len(pts)
                c.drawRightString(tx(cx) - 12, ty(cy), label)
        elif kind == "text":
            _, x, y, label = shape
            c.drawCentredString(tx(x), ty(y), label)
    c.setDash()
    c.setStrokeGray(0)
    c.setFillGray(0)


def _holes(c, tx, ty, s, holes, font):
    for key, x, y in holes:
        r = HOLE_D[key] / 2
        c.setLineWidth(0.4)
        c.circle(tx(x), ty(y), r * s)
        arm = max(r + 3, 5)
        c.setLineWidth(0.25)
        c.line(tx(x - arm), ty(y), tx(x + arm), ty(y))
        c.line(tx(x), ty(y - arm), tx(x), ty(y + arm))
        c.setFont("Helvetica-Bold", font)
        c.drawString(tx(x + arm * 0.7), ty(y + arm * 0.7), key)


def _legend(c, x, y, holes):
    counts = Counter(k for k, _, _ in holes)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Holes (drill from this face unless noted)")
    y -= 13
    for key in sorted(counts):
        size, purpose = HOLE_TYPES[key]
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(x, y, f"{key}  x{counts[key]}")
        c.setFont("Helvetica", 8.5)
        c.drawString(x + 36, y, f"{size}: {purpose}")
        y -= 11.5
    return y


def _scale_square(c, x, y):
    side = 2 * P.IN * mm
    c.setLineWidth(0.6)
    c.rect(x, y, side, side)
    c.setFont("Helvetica", 7)
    c.drawString(x + 2, y + side / 2 - 3, "2 in / 50.8 mm")
    c.drawString(x + side + 4, y + 2, "Measure this square. If it is not exactly 2 in, reprint at 100% / Actual size.")


def build_template(path, title, holes, outlines, notes):
    c = canvas.Canvas(str(path), pagesize=letter)

    # Overview page, scaled to fit.
    s = (PAGE_W - 2 * 54) / (P.PANEL * mm) * mm
    ox, oy = PAGE_W / 2, PAGE_H - 70 - HALF * s

    def tx(v):
        return ox + v * s

    def ty(v):
        return oy + v * s

    c.setFont("Helvetica-Bold", 14)
    c.drawString(54, PAGE_H - 48, title)
    c.setFont("Helvetica", 8.5)
    c.drawString(54, PAGE_H - 62, "Overview (not to scale). Pages 2-5 are the 1:1 template.")
    _panel_lines(c, tx, ty, s)
    _outlines(c, tx, ty, s, outlines, 5.5)
    _holes(c, tx, ty, s, holes, 6)
    y = _legend(c, 54, oy - HALF * s - 22, holes)
    c.setFont("Helvetica", 8.5)
    steps = [
        "1. Print pages 2-5 at 100% / Actual size and check the 2 in square on each.",
        "2. Overlap the sheets so the dashed centre lines and diagonals line up; tape them.",
        "3. Draw corner-to-corner diagonals on the plywood. Line up the template's outline and diagonals.",
        "4. Centre-punch every cross, remove the template, then drill.",
    ] + notes
    y -= 6
    for line in steps:
        c.drawString(54, y, line)
        y -= 11.5
    c.showPage()

    # 1:1 tiles.
    s = mm
    quadrants = [("top left", -1, 1), ("top right", 1, 1), ("bottom left", -1, -1), ("bottom right", 1, -1)]
    for name, qx, qy in quadrants:
        x_lo = -HALF - MARGIN if qx < 0 else -MARGIN
        y_lo = -HALF - MARGIN if qy < 0 else -MARGIN
        px0 = (PAGE_W - TILE * mm) / 2
        py0 = 180  # above the 2 in scale square

        def tx(v, x_lo=x_lo, px0=px0):
            return px0 + (v - x_lo) * s

        def ty(v, y_lo=y_lo, py0=py0):
            return py0 + (v - y_lo) * s

        c.saveState()
        p = c.beginPath()
        p.rect(px0, py0, TILE * mm, TILE * mm)
        c.clipPath(p, stroke=0)
        _panel_lines(c, tx, ty, s)
        _outlines(c, tx, ty, s, outlines, 7)
        _holes(c, tx, ty, s, holes, 7)
        c.restoreState()
        c.setLineWidth(0.3)
        c.setDash(1, 2)
        c.rect(px0, py0, TILE * mm, TILE * mm)
        c.setDash()
        c.setFont("Helvetica-Bold", 11)
        c.drawString(36, PAGE_H - 40, f"{title}: {name} sheet")
        c.setFont("Helvetica", 8)
        c.drawString(36, PAGE_H - 53, "1:1. Overlap neighbouring sheets on the dashed centre lines. Top face up.")
        _scale_square(c, 36, 24)
        c.showPage()
    c.save()
