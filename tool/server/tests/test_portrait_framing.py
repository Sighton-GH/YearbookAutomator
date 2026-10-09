from PIL import Image, ImageDraw

from app.services.generator import _fit_image
from app.services.portrait_framing import (
    PortraitFocus,
    PortraitShadow,
    PortraitStyle,
    build_border,
    build_shape_mask,
    compute_cover_crop,
    fit_portrait,
    paste_portrait,
)


def _img(w=300, h=200):
    im = Image.new("RGB", (w, h), (10, 120, 200))
    d = ImageDraw.Draw(im)
    d.ellipse((40, 40, 80, 80), fill=(255, 0, 0))
    for i in range(0, w, 17):
        d.line((i, 0, i, h), fill=(i % 256, 50, 90))
    return im


def test_default_matches_current_fit_and_paste():
    im = _img()
    expected = Image.new("RGB", (400, 300), (255, 255, 255))
    expected.paste(_fit_image(im, 100, 120), (20, 30))
    got = Image.new("RGB", (400, 300), (255, 255, 255))
    assert paste_portrait(got, im, (20, 30, 100, 120)) == []
    assert list(got.getdata()) == list(expected.getdata())
    assert PortraitStyle().is_default


def test_from_request_defaults_and_bad_values():
    class P:
        pass

    assert PortraitStyle.from_request(P()).is_default
    p = P()
    p.mugshot_shape = "star"
    p.mugshot_fit = "stretch"
    p.mugshot_corner_radius = 9999
    p.mugshot_border_color = "nope"
    s = PortraitStyle.from_request(p)
    assert s.shape == "rect" and s.fit == "cover" and s.corner_radius == 500
    assert s.border_color == (255, 255, 255)


def test_focus_beats_face_beats_centre():
    size, target = (300, 200), (100, 100)
    _, centre = compute_cover_crop(size, target)
    _, face = compute_cover_crop(size, target, None, (30, 60, 70, 120), True)
    _, focus = compute_cover_crop(size, target, PortraitFocus(0.9, 0.5), (30, 60, 70, 120), True)
    assert face[0] < centre[0] < focus[0]
    _, ignored = compute_cover_crop(size, target, None, (30, 60, 70, 120), False)
    assert ignored == centre


def test_focus_zoom_enlarges_and_crop_in_bounds():
    (nw, nh), (x0, y0) = compute_cover_crop((300, 200), (100, 100), PortraitFocus(1, 1, 2.0))
    assert nw > 300 * 0.5 and x0 + 100 <= nw and y0 + 100 <= nh
    out = fit_portrait(_img(), 100, 100, PortraitStyle(), PortraitFocus(0.2, 0.3, 3.0))
    assert out.size == (100, 100)


def test_focus_puts_point_in_centre():
    im = Image.new("RGB", (300, 200), (255, 255, 255))
    ImageDraw.Draw(im).ellipse((170, 90, 190, 110), fill=(255, 0, 0))
    out = fit_portrait(im, 100, 100, PortraitStyle(), PortraitFocus(0.6, 0.5, 1.0))
    r, g, b = out.getpixel((50, 50))
    assert r > 200 and g < 80


def test_contain_letterboxes_with_fill():
    st = PortraitStyle(fit="contain", contain_fill_color=(1, 2, 3))
    out = fit_portrait(_img(300, 100), 100, 100, st)
    assert out.size == (100, 100)
    assert out.getpixel((50, 2)) == (1, 2, 3)
    assert out.getpixel((50, 50)) != (1, 2, 3)


def test_shape_masks():
    assert build_shape_mask(50, 50, "rect") is None
    assert build_shape_mask(50, 50, "rounded", 0) is None
    ell = build_shape_mask(60, 40, "ellipse")
    assert ell.getpixel((0, 0)) == 0 and ell.getpixel((30, 20)) == 255
    rr = build_shape_mask(60, 40, "rounded", 500)  # clamped
    assert rr.getpixel((0, 0)) == 0 and rr.getpixel((30, 20)) == 255
    rr2 = build_shape_mask(60, 40, "rounded", 10)
    assert rr2.getpixel((30, 0)) == 255


def test_border_inside_edge_only():
    ring = build_border(None, 40, 40, 5, "rect", 0)
    assert ring.getpixel((0, 20)) == 255 and ring.getpixel((4, 20)) == 255
    assert ring.getpixel((5, 20)) == 0 and ring.getpixel((20, 20)) == 0
    assert build_border(None, 40, 40, 0, "rect", 0) is None


def test_paste_with_ellipse_border_shadow():
    base = Image.new("RGB", (200, 200), (255, 255, 255))
    st = PortraitStyle(shape="ellipse", border_width=4, border_color=(0, 0, 255),
                       shadow=PortraitShadow(opacity=1.0, offset_x=10, offset_y=10, blur=0))
    paste_portrait(base, _img(), (50, 50, 80, 80), st)
    assert base.getpixel((51, 51)) == (255, 255, 255)      # corner outside ellipse
    assert base.getpixel((50, 90)) == (0, 0, 255)          # border at left edge
    assert base.getpixel((100, 100)) != (255, 255, 255)    # photo
    assert base.getpixel((134, 100)) == (0, 0, 0)           # shadow, outside the photo


def test_face_aware_without_face_warns():
    base = Image.new("RGB", (100, 100))
    w = paste_portrait(base, _img(), (0, 0, 50, 50), PortraitStyle(face_aware=True))
    assert len(w) == 1 and "face" in w[0]
