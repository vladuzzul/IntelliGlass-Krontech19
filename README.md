# ![MagicMirror²: The open source modular smart mirror platform.](.github/header.png)

<p style="text-align: center">
  <a href="https://choosealicense.com/licenses/mit">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
 </a>
 <img src="https://img.shields.io/github/actions/workflow/status/magicmirrororg/magicmirror/automated-tests.yaml" alt="GitHub Actions">
 <img src="https://img.shields.io/github/check-runs/magicmirrororg/magicmirror/master" alt="Build Status">
 <a href="https://github.com/MagicMirrorOrg/MagicMirror">
  <img src="https://img.shields.io/github/stars/magicmirrororg/magicmirror?style=social" alt="GitHub Stars">
 </a>
</p>

**MagicMirror²** is an open source modular smart mirror platform. With a growing list of installable modules, the **MagicMirror²** allows you to convert your hallway or bathroom mirror into your personal assistant. **MagicMirror²** is built by the creator of [the original MagicMirror](https://michaelteeuw.nl/tagged/magicmirror) with the incredible help of a [growing community of contributors](https://github.com/MagicMirrorOrg/MagicMirror/graphs/contributors).

MagicMirror² focuses on a modular plugin system and uses [Electron](https://www.electronjs.org/) as an application wrapper. So no more web server or browser installs necessary!

![Animated demonstration of MagicMirror²](https://magicmirror.builders/img/demo.gif)

## Documentation

For the full documentation including **[installation instructions](https://docs.magicmirror.builders/getting-started/installation.html)**, please visit our dedicated documentation website: [https://docs.magicmirror.builders](https://docs.magicmirror.builders).

## Links

- Website: [https://magicmirror.builders](https://magicmirror.builders)
- Documentation: [https://docs.magicmirror.builders](https://docs.magicmirror.builders)
- Forum: [https://forum.magicmirror.builders](https://forum.magicmirror.builders)
  - Technical discussions: <https://forum.magicmirror.builders/category/11/core-system>
- Discord: [https://discord.gg/J5BAtvx](https://discord.gg/J5BAtvx)
- Blog: [https://michaelteeuw.nl/tagged/magicmirror](https://michaelteeuw.nl/tagged/magicmirror)
- Donations: [https://magicmirror.builders/#donate](https://magicmirror.builders/#donate)

## Contributing Guidelines

Contributions of all kinds are welcome, not only in the form of code but also with regards to

- bug reports
- documentation
- translations

For the full contribution guidelines, check out: [https://docs.magicmirror.builders/about/contributing.html](https://docs.magicmirror.builders/about/contributing.html)

## Enjoying MagicMirror? Consider a donation!

MagicMirror² is Open Source and free. That doesn't mean we don't need any money.

Please consider a donation to help us cover the ongoing costs like webservers and email services.
If we receive enough donations we might even be able to free up some working hours and spend some extra time improving the MagicMirror² core.

To donate, please follow [this](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=G5D8E9MR5DTD2&source=url) link.

<p style="text-align: center">
  <a href="https://forum.magicmirror.builders/topic/728/magicmirror-is-voted-number-1-in-the-magpi-top-50">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://magicmirror.builders/img/magpi-best-watermark.png">
      <img src="https://magicmirror.builders/img/magpi-best-watermark-custom.png" width="150" alt="MagPi Top 50">
    </picture>
  </a>
</p>
# IntelliGlass-Krontech19

## Raspberry Pi 4 + Camera Module 3 (finger.py)

`finger.py` now supports camera backend selection:

- `MM_CAMERA_BACKEND=auto` (default): tries OpenCV first, then Picamera2.
- `MM_CAMERA_BACKEND=opencv`: force `/dev/video*` capture.
- `MM_CAMERA_BACKEND=picamera2`: force libcamera/Picamera2.

Recommended setup on Raspberry Pi OS (Bookworm or newer):

```bash
sudo apt update
sudo apt install -y python3-picamera2 python3-libcamera rpicam-apps
```

For Raspberry Pi OS based on Debian 13 (Trixie), install Python 3.12 for `finger.py`:

```bash
sudo apt install -y python3.12 python3.12-venv
```

Then start MagicMirror with:

```bash
MM_FINGER_PYTHON=python3.12 MM_CAMERA_BACKEND=picamera2 npm start
```

On Linux, the app creates `.venv` with `--system-site-packages` by default so `python3-picamera2` installed via `apt` is visible inside `finger.py`.

If you created `.venv` before this change, recreate it once:

```bash
rm -rf .venv
```

Optional environment variables:

- `MM_CAMERA_INDEX` (default `0`)
- `MM_CAMERA_INDEXES` (example: `0,1,2`)
- `MM_CAMERA_WIDTH` / `MM_CAMERA_HEIGHT`
- `MM_SHOW_CAMERA_WINDOW=0` to disable OpenCV preview window
