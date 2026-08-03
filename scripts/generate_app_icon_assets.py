from pathlib import Path
import json
import shutil

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
COLORWAYS = ROOT / "asset/Logo Colorways - Black"
ANDROID_RES = ROOT / "composeApp/src/androidMain/res"
ANDROID_THEMES = ANDROID_RES / "values/themes.xml"
ANDROID_THEMES_V31 = ANDROID_RES / "values-v31/themes.xml"
ANDROID_SPLASH = ANDROID_RES / "drawable-nodpi"
COMPOSE_DRAWABLE = ROOT / "composeApp/src/commonMain/composeResources/drawable"
IOS_ASSETS = ROOT / "iosApp/iosApp/Assets.xcassets"
PREVIEW_BOARD = ROOT / "build/app-icon-full-catalogue.png"
WORDMARK_SOURCE = COMPOSE_DRAWABLE / "app_logo_wordmark.png"
FONT = Path("/System/Library/Fonts/SFNS.ttf")

ALL_VARIANTS = [
    ("original", "01-original-on-black.png", "AppIcon", "Original"),
    ("glacier", "02-glacier.png", "AppIconGlacier", "Glacier"),
    ("arctic_blue", "03-arctic-blue.png", "AppIconArcticBlue", "Arctic Blue"),
    ("cobalt_pulse", "04-cobalt-pulse.png", "AppIconCobaltPulse", "Cobalt Pulse"),
    ("sapphire", "05-sapphire.png", "AppIconSapphire", "Sapphire"),
    ("electric_violet", "06-electric-violet.png", "AppIconElectricViolet", "Electric Violet"),
    ("polar_mint", "07-polar-mint.png", "AppIconPolarMint", "Polar Mint"),
    ("tidal", "08-tidal.png", "AppIconTidal", "Tidal"),
    ("turquoise", "09-turquoise.png", "AppIconTurquoise", "Turquoise"),
    ("emerald", "10-emerald.png", "AppIconEmerald", "Emerald"),
    ("jade", "11-jade.png", "AppIconJade", "Jade"),
    ("lime_pulse", "12-lime-pulse.png", "AppIconLimePulse", "Lime Pulse"),
    ("sunset", "13-sunset.png", "AppIconSunset", "Sunset"),
    ("magenta_rush", "14-magenta-rush.png", "AppIconMagentaRush", "Magenta Rush"),
    ("cherry_pop", "15-cherry-pop.png", "AppIconCherryPop", "Cherry Pop"),
    ("crimson", "16-crimson.png", "AppIconCrimson", "Crimson"),
    ("ember_gold", "17-ember-gold.png", "AppIconEmberGold", "Ember Gold"),
    ("solar", "18-solar.png", "AppIconSolar", "Solar"),
    ("rose_gold", "19-rose-gold.png", "AppIconRoseGold", "Rose Gold"),
    ("amethyst", "20-amethyst.png", "AppIconAmethyst", "Amethyst"),
    ("burgundy", "21-burgundy.png", "AppIconBurgundy", "Burgundy"),
    ("copper", "22-copper.png", "AppIconCopper", "Copper"),
    ("champagne", "23-champagne.png", "AppIconChampagne", "Champagne"),
    ("graphite", "24-graphite.png", "AppIconGraphite", "Graphite"),
]

SHORTLIST_KEYS = {
    "original",
    "arctic_blue",
    "emerald",
    "rose_gold",
    "copper",
    "graphite",
}

VARIANTS = [variant for variant in ALL_VARIANTS if variant[0] in SHORTLIST_KEYS]

DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}


def resized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def expanded_logo(
    image: Image.Image,
    max_width_ratio: float,
    max_height_ratio: float,
) -> Image.Image:
    rgba = image.convert("RGBA")
    bounds = rgba.getchannel("A").getbbox()
    if bounds is None:
        return rgba
    mark = rgba.crop(bounds)
    scale = min(
        rgba.width * max_width_ratio / mark.width,
        rgba.height * max_height_ratio / mark.height,
    )
    mark = mark.resize(
        (round(mark.width * scale), round(mark.height * scale)),
        Image.Resampling.LANCZOS,
    )
    original_center_x = ((bounds[0] + bounds[2]) / 2) / rgba.width
    original_center_y = ((bounds[1] + bounds[3]) / 2) / rgba.height
    x = round(rgba.width * original_center_x - mark.width / 2)
    y = round(rgba.height * original_center_y - mark.height / 2)
    canvas = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    canvas.alpha_composite(mark, (x, y))
    return canvas


def on_black(image: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", image.size, (0, 0, 0, 255))
    canvas.alpha_composite(image)
    return canvas.convert("RGB")


def wordmark_for(image: Image.Image) -> Image.Image:
    base = Image.open(WORDMARK_SOURCE).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        return base
    mark = image.crop(bounds)
    scale = base.height / mark.height
    mark = mark.resize(
        (round(mark.width * scale), base.height),
        Image.Resampling.LANCZOS,
    )
    canvas = base.copy()
    canvas.paste((0, 0, 0, 0), (0, 0, round(base.height * 1.04), base.height))
    canvas.alpha_composite(mark, (0, 0))
    return canvas


def save_webp(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", lossless=True, method=6)


def round_icon(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    mask = Image.new("L", rgba.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, rgba.width - 1, rgba.height - 1), fill=255)
    rgba.putalpha(mask)
    return rgba


def monochrome_icon(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    white = Image.new("RGBA", rgba.size, (255, 255, 255, 0))
    white.putalpha(rgba.getchannel("A"))
    return white


def ios_contents() -> dict:
    return {
        "images": [
            {
                "filename": "app-icon-1024.png",
                "idiom": "universal",
                "platform": "ios",
                "size": "1024x1024",
            },
            {
                "appearances": [{"appearance": "luminosity", "value": "dark"}],
                "idiom": "universal",
                "platform": "ios",
                "size": "1024x1024",
            },
            {
                "appearances": [{"appearance": "luminosity", "value": "tinted"}],
                "idiom": "universal",
                "platform": "ios",
                "size": "1024x1024",
            },
        ],
        "info": {
            "author": "xcode",
            "version": 1,
        },
    }


def adaptive_icon_contents(foreground_name: str) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/app_icon_background" />
    <foreground android:drawable="@mipmap/{foreground_name}" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
"""


def splash_theme_name(ios_name: str) -> str:
    if ios_name == "AppIcon":
        return "Theme.Nuvio.Splash"
    return f"Theme.Nuvio.Splash.{ios_name.removeprefix('AppIcon')}"


def base_theme_contents() -> str:
    alternate_themes = "\n".join(
        f'    <style name="{splash_theme_name(ios_name)}" parent="@style/Theme.Nuvio.Splash" />'
        for _, _, ios_name, _ in VARIANTS[1:]
    )
    return f"""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.Nuvio" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@color/nuvio_background</item>
    </style>

    <style name="Theme.Nuvio.Splash" parent="@style/Theme.Nuvio" />
{alternate_themes}
</resources>
"""


def v31_theme_contents() -> str:
    alternate_themes = "\n\n".join(
        f"""    <style name="{splash_theme_name(ios_name)}" parent="@style/Theme.Nuvio.Splash">
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_splash_logo_{key}</item>
    </style>"""
        for key, _, ios_name, _ in VARIANTS[1:]
    )
    return f"""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.Nuvio" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@color/nuvio_background</item>
    </style>

    <style name="Theme.Nuvio.Splash" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/nuvio_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_splash_logo</item>
        <item name="postSplashScreenTheme">@style/Theme.Nuvio</item>
    </style>

{alternate_themes}
</resources>
"""


def remove_retired_assets() -> None:
    for key, _, ios_name, _ in ALL_VARIANTS:
        if key in SHORTLIST_KEYS:
            continue
        (COMPOSE_DRAWABLE / f"app_icon_{key}.png").unlink(missing_ok=True)
        (COMPOSE_DRAWABLE / f"app_logo_wordmark_{key}.png").unlink(missing_ok=True)
        (ANDROID_SPLASH / f"ic_splash_logo_{key}.webp").unlink(missing_ok=True)
        (ANDROID_RES / "mipmap-anydpi-v26" / f"ic_launcher_{key}.xml").unlink(
            missing_ok=True,
        )
        for density in DENSITIES:
            directory = ANDROID_RES / f"mipmap-{density}"
            (directory / f"ic_launcher_{key}.webp").unlink(missing_ok=True)
            (directory / f"ic_launcher_{key}_foreground.webp").unlink(missing_ok=True)
        shutil.rmtree(IOS_ASSETS / f"{ios_name}.appiconset", ignore_errors=True)


def generate_preview_board(icons: list[tuple[str, Image.Image]]) -> None:
    columns = 6
    tile_width = 220
    tile_height = 244
    margin = 32
    header_height = 104
    rows = (len(icons) + columns - 1) // columns
    board = Image.new(
        "RGB",
        (margin * 2 + columns * tile_width, header_height + margin + rows * tile_height),
        (8, 8, 10),
    )
    draw = ImageDraw.Draw(board)
    title_font = ImageFont.truetype(FONT, 34)
    label_font = ImageFont.truetype(FONT, 18)
    draw.text((margin, 28), "NUVIO / APP ICON CATALOGUE", fill=(245, 245, 247), font=title_font)
    draw.text((margin, 70), "6 shortlisted colorways · pure black field", fill=(150, 150, 158), font=label_font)

    for index, (label, icon) in enumerate(icons):
        row = index // columns
        column = index % columns
        x = margin + column * tile_width
        y = header_height + row * tile_height
        draw.rounded_rectangle(
            (x + 6, y + 6, x + tile_width - 6, y + tile_height - 8),
            radius=24,
            fill=(17, 17, 20),
            outline=(42, 42, 47),
            width=1,
        )
        preview = resized(icon, 168)
        board.paste(preview, (x + 26, y + 22))
        text_bounds = draw.textbbox((0, 0), label, font=label_font)
        text_width = text_bounds[2] - text_bounds[0]
        draw.text(
            (x + (tile_width - text_width) / 2, y + 204),
            label,
            fill=(232, 232, 237),
            font=label_font,
        )

    PREVIEW_BOARD.parent.mkdir(parents=True, exist_ok=True)
    board.save(PREVIEW_BOARD, "PNG", optimize=True)


def generate() -> None:
    COMPOSE_DRAWABLE.mkdir(parents=True, exist_ok=True)
    remove_retired_assets()
    previews = []

    for key, filename, ios_name, label in VARIANTS:
        transparent = Image.open(COLORWAYS / "transparent" / filename).convert("RGBA")
        expanded = expanded_logo(transparent, max_width_ratio=0.70, max_height_ratio=0.74)
        adaptive = expanded_logo(transparent, max_width_ratio=0.52, max_height_ratio=0.55)
        black = on_black(expanded)
        launcher_name = "ic_launcher" if key == "original" else f"ic_launcher_{key}"
        foreground_name = f"{launcher_name}_foreground"
        splash_name = "ic_splash_logo" if key == "original" else f"ic_splash_logo_{key}"
        previews.append((label, black))

        save_webp(transparent, ANDROID_SPLASH / f"{splash_name}.webp")

        adaptive_directory = ANDROID_RES / "mipmap-anydpi-v26"
        adaptive_directory.mkdir(parents=True, exist_ok=True)
        (adaptive_directory / f"{launcher_name}.xml").write_text(
            adaptive_icon_contents(foreground_name),
            encoding="utf-8",
        )

        resized(black, 256).save(
            COMPOSE_DRAWABLE / f"app_icon_{key}.png",
            "PNG",
            optimize=True,
        )
        wordmark_for(transparent).save(
            COMPOSE_DRAWABLE / f"app_logo_wordmark_{key}.png",
            "PNG",
            optimize=True,
        )

        icon_set = IOS_ASSETS / f"{ios_name}.appiconset"
        icon_set.mkdir(parents=True, exist_ok=True)
        resized(black, 1024).save(icon_set / "app-icon-1024.png", "PNG", optimize=True)
        (icon_set / "Contents.json").write_text(
            json.dumps(ios_contents(), indent=2) + "\n",
            encoding="utf-8",
        )

        for density, scale in DENSITIES.items():
            directory = ANDROID_RES / f"mipmap-{density}"
            legacy_size = round(48 * scale)
            foreground_size = round(108 * scale)
            save_webp(resized(black, legacy_size), directory / f"{launcher_name}.webp")
            save_webp(
                resized(adaptive, foreground_size),
                directory / f"{foreground_name}.webp",
            )

            if key == "original":
                save_webp(
                    round_icon(resized(black, legacy_size)),
                    directory / "ic_launcher_round.webp",
                )
                save_webp(
                    resized(monochrome_icon(adaptive), foreground_size),
                    directory / "ic_launcher_monochrome.webp",
                )

    generate_preview_board(previews)
    ANDROID_THEMES.write_text(base_theme_contents(), encoding="utf-8")
    ANDROID_THEMES_V31.write_text(v31_theme_contents(), encoding="utf-8")


if __name__ == "__main__":
    generate()
