from PIL import Image, ImageDraw


def test_fit_image_with_focus_centers_focus_point():
    # Import from generator (private helper is OK for unit testing behavior).
    from app.services.generator import _fit_image_with_focus

    # Create a wide image with a distinctive dot near the left side.
    img = Image.new("RGB", (300, 120), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    focus_x, focus_y = 60, 60
    draw.ellipse((focus_x - 6, focus_y - 6, focus_x + 6, focus_y + 6), fill=(255, 0, 0))

    out = _fit_image_with_focus(img, target_w=120, target_h=120, focus_x=focus_x, focus_y=focus_y)
    assert out.size == (120, 120)

    # The focused red dot should land near the center of the output.
    cx, cy = out.size[0] // 2, out.size[1] // 2
    r, g, b = out.getpixel((cx, cy))
    assert r > 200 and g < 80 and b < 80
