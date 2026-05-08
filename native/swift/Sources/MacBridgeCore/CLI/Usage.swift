import Foundation

func usage() -> String {
    """
    macbridge: background macOS window control for coding agents

    This tool lets an agent inspect and operate a target app window without
    activating it, or operate the frontmost app / desktop in foreground modes.
    Start with list-apps or list-windows, capture a screenshot, inspect the
    saved image, then act using coordinates from that image.

    usage:
      macbridge list-apps
      macbridge list-displays
      macbridge list-windows
      macbridge list-windows [--app NAME] [--bundle-id ID] [--pid PID]
      macbridge active-window
      macbridge windows list [--app NAME] [--bundle-id ID] [--pid PID]
      macbridge windows frame <wid|app> [--any-window]
      macbridge windows set-frame <wid|app> <x> <y> <width> <height> [--any-window]
      macbridge windows maximize <wid|app> [--display main] [--margin N] [--any-window]
      macbridge windows activate <wid|app> [--any-window]
      macbridge displays list
      macbridge displays info [<index|displayID|main|name>]
      macbridge capture window <wid|app> [-o path] [--png] [--quality 0.8] [--any-window]
      macbridge capture app [-o path] [--png] [--quality 0.8]
      macbridge capture desktop [-o path] [--png] [--quality 0.8]
      macbridge capture display <index|displayID|main|name> [-o path] [--png] [--quality 0.8]
      macbridge act window <wid|app> <action> ...
      macbridge act app <action> ...
      macbridge act desktop <action> ...
      macbridge act display <index|displayID|main|name> <action> ...
      macbridge permissions check [--prompt] [--require]
      macbridge cursor <command> ...
      macbridge service <command> ...
      macbridge background <command> ...
      macbridge foreground-app <command> ...
      macbridge foreground-desktop <command> ...
      macbridge foreground-display <index|displayID|main|name> <command> ...
      macbridge screenshot <wid|app> [-o path] [--png] [--quality 0.8] [--any-window]
      macbridge activate <wid|app> [--any-window]
      macbridge click <wid|app> <x> <y> [--coord pixel|normalized|global] [--any-window]
      macbridge right-click <wid|app> <x> <y> [--coord pixel|normalized|global] [--any-window]
      macbridge double-click <wid|app> <x> <y> [--coord pixel|normalized|global] [--any-window]
      macbridge drag <wid|app> <x1> <y1> <x2> <y2> [--duration 0.3] [--steps 20] [--coord pixel|normalized|global] [--any-window]
      macbridge scroll <wid|app> <x> <y> <dx> <dy> [--coord pixel|normalized|global] [--any-window]
      macbridge type <wid|app> <text> [--at X Y] [--replace] [--activate] [--key-hold-ms N] [--key-gap-ms N] [--coord pixel|normalized|global] [--any-window]
      macbridge paste <wid|app> <text> [--at X Y] [--activate] [--submit] [--keep-clipboard] [--coord pixel|normalized|global] [--any-window]
      macbridge press <wid|app> <key> [--mod cmd]... [--any-window]
      macbridge hotkey <wid|app> <mod>... <key> [--any-window]

    agent loop:
      1. Run list-apps if you need a bundle id or pid.
      2. Run list-windows, optionally filtered by --app/--bundle-id/--pid,
         and choose a wid.
      3. Run screenshot <wid> --png, or pass -o screens/window.png.
      4. Inspect the actual image dimensions, or use width/height from
         list-windows. Those dimensions are the coordinate frame.
      5. Click/type/drag/scroll with x,y measured from the screenshot's top-left.

    modes:
      background         Operate a specific window id (wid) or an app name.
                         If the app has one layer-0 window, it is used directly.
                         If it has multiple windows, pass an exact wid or add
                         --any-window to let the tool pick one. Coordinates are
                         window-local.
      foreground-app     Operate the frontmost app window. Screenshots are
                         cropped to the active window bounds, excluding shadow.
                         Coordinates are window-local unless --coord global.
      foreground-desktop Operate the main display. Screenshots are full-screen.
                         Coordinates are display-local pixels or normalized.
                         Use `info` to get width/height for the current screen.
      foreground-display Operate a specific display by list-displays index,
                         CGDirectDisplayID/NSScreenNumber, "main", or name.
                         Coordinates are local to that display.

    coordinate modes:
      pixel       Default. x,y are window-local screenshot pixels, top-left
                  origin. If the screenshot is 1200x800, its bottom-right is
                  approximately x=1199,y=799. This is the safest mode for GPT
                  agents because it matches the captured image bytes.
      normalized  x,y are fractions of the window size from 0.0 to 1.0. Use this
                  only when reasoning proportionally across changing window sizes.
      global      x,y are macOS global screen coordinates. Use only when you
                  already have absolute display coordinates.

    image and coordinate warning:
      Do not use coordinates from a downscaled preview in a chat UI or image
      viewer. Viewers often display the screenshot smaller than its real pixel
      size. Convert proportionally back to the real screenshot/list-windows size.
      Example: a target that appears 25% across and 40% down in any preview of a
      1000x700 window should be clicked at x=250,y=280.

    command behavior:
      list-apps      Prints JSON running apps: pid,name,bundleID,running,active,
                     hidden,bundlePath. This is for discovering bundle IDs/PIDs.
      list-displays  Prints JSON active displays: index, displayID/screenNumber,
                     localized name, bounds, scale, pixel size, and main flag.
      list-windows   Prints JSON windows: pid,wid,x,y,width,height,owner,name.
                     Only normal layer-0 app windows are listed. Add filters to
                     get windows for a specific app.
      windows frame  Prints JSON for a single target window frame.
      windows set-frame
                     Sets target window position and size via Accessibility.
      windows maximize
                     Fits target window to a display's visible work area. This
                     does not enter macOS fullscreen or move the app to a Space.
      windows activate
                     Brings a target window's app forward and raises that window.
                     Use this when a workflow intentionally needs foreground AX.
      background app targeting
                     Background commands accept either a wid or an app name such
                     as "Helium". If multiple windows match, the command errors
                     and prints candidate window ids unless --any-window is used.
      active-window  Prints JSON for the frontmost app's current layer-0 window.
      foreground-app info
                     Prints JSON for the current frontmost app window.
      foreground-desktop info
                     Prints JSON for the main display bounds.
      screenshot     Saves a window image and prints the output path, not JSON.
                     Uses CoreGraphics first and falls back to ScreenCaptureKit
                     on macOS 14+ when a single-window capture needs it.
      click          Tries Accessibility first: AXPress, text focus, row select.
                     Falls back to CGEventPostToPid for canvas/opaque areas.
                     Prints {"plan","role","ok"} so agents can see the route.
      right-click    Uses PID-targeted CG events.
      double-click   Sends two clicks at the same coordinate.
      drag           Sends interpolated PID-targeted mouse events.
      scroll         Tries AX page scroll first, then CG wheel. Positive dy means
                     scroll down; positive dx means scroll right. Prints {"via"}.
      type           With --at X Y, first targets that point. AX text insertion is
                     preferred because it handles Unicode and does not depend on
                     keyboard layout. Falls back to synthetic keyboard events.
                     Use --activate and slower key timing when a terminal drops
                     background keystrokes.
      paste          Sets clipboard text, sends Cmd+V, and optionally submits
                     with Enter. This is the exact-text lane for long prompts.
                     Clipboard text is restored by default.
      press/hotkey   Sends US-keyboard virtual-key events to the target PID.
      permissions    Checks macOS Accessibility and Screen Recording permission
                     state for the launching terminal/app or signed binary.
      cursor         Runs a persistent visual overlay cursor. In background mode,
                     it is ordered relative to the target window so overlapping
                     front windows should cover it while the target app is behind.
      service        Runs the CLI as a long-running daemon that accepts commands
                     over a UNIX domain socket at /tmp/macbridge-service/sock.
                     `service send <args...>` pipes argv to the daemon, which
                     executes the same commands as the CLI and returns stdout,
                     stderr, and an exit code as JSON. The daemon auto-spawns on
                     first `service send` if not running, auto-hides the cursor
                     overlay after a short idle period, and stops the cursor
                     overlay cleanly on `service stop`.

    service commands:
      service start           Spawn the daemon in the background. Idempotent.
      service stop            Shut down the daemon and its cursor overlay.
      service status          JSON status: running pid, socket, cursor state.
      service send <args>...  Execute argv inside the running daemon.
      service ping            Round-trip check against the daemon.
      service run             Run the daemon in the foreground (used internally
                              by `service start`; useful for launchd supervision).

    permissions:
      Accessibility is required for AX actions and most input reliability.
      Screen Recording is required for screenshots. Grant permissions to the
      launching terminal/app or to the compiled binary.

    examples:
      macbridge list-apps
      macbridge list-displays
      macbridge list-windows
      macbridge list-windows --bundle-id net.imput.helium
      macbridge list-windows --app Helium
      macbridge active-window
      macbridge permissions check
      macbridge cursor start background 12345 240 180 --duration 0.0
      macbridge cursor start background Helium 240 180 --duration 0.0 --any-window
      macbridge cursor start display 2 240 180 --duration 0.0
      macbridge cursor move 400 320 --duration 0.25 --wait
      macbridge cursor retarget foreground-app --wait
      macbridge cursor retarget display main --wait
      macbridge cursor click --wait
      macbridge cursor hide
      macbridge cursor stop
      macbridge service start
      macbridge service send list-windows
      macbridge service send cursor start foreground-desktop 400 400
      macbridge service send cursor move 700 400 --duration 0.25 --wait
      macbridge service status
      macbridge service stop
      macbridge screenshot 12345 --png -o screens/app.png
      macbridge screenshot Helium --png -o screens/helium.png --any-window
      macbridge activate Helium --any-window
      macbridge foreground-app screenshot --png -o screens/front.png
      macbridge foreground-desktop screenshot --png -o screens/screen.png
      macbridge foreground-display 2 info
      macbridge foreground-display 2 screenshot --png -o screens/display-2.png
      macbridge foreground-display 2 click 240 180
      macbridge windows list --app Helium
      macbridge windows frame Helium --any-window
      macbridge windows maximize Helium --display main --any-window
      macbridge windows activate Helium --any-window
      macbridge displays list
      macbridge capture window 12345 --png -o screens/app.png
      macbridge capture display 2 --png -o screens/display-2.png
      macbridge act window 12345 click 240 180
      macbridge act display 2 click 240 180
      macbridge foreground-app click 240 180
      macbridge foreground-desktop click 240 180
      macbridge click 12345 240 180
      macbridge click Helium 240 180 --any-window
      macbridge click 12345 0.25 0.40 --coord normalized
      macbridge double-click 12345 410 300
      macbridge right-click 12345 410 300
      macbridge drag 12345 120 400 500 400 --duration 0.5 --steps 30
      macbridge scroll 12345 600 500 0 700
      macbridge scroll 12345 600 500 0 -700
      macbridge type 12345 "hello world" --at 320 740
      macbridge type 12345 "hello world" --activate --key-hold-ms 25 --key-gap-ms 15
      macbridge paste 12345 "hello world" --activate --submit
      macbridge press 12345 Enter
      macbridge press 12345 ArrowDown
      macbridge press 12345 c --mod cmd
      macbridge press 12345 p --mod cmd --mod shift
      macbridge hotkey 12345 cmd c
      macbridge hotkey 12345 cmd v
      macbridge hotkey 12345 cmd shift p
      macbridge hotkey 12345 cmd alt Escape
    """
}
