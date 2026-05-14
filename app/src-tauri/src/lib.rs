use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

mod commands;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let db = db::open()?;
            app.manage(db::DbState(std::sync::Mutex::new(db)));

            let quit = MenuItem::with_id(app, "quit", "Quit ossdive", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                // position is PhysicalPosition<f64>; account for DPI scale
                                let scale = win.scale_factor().unwrap_or(1.0);
                                let half_w = (190.0 * scale) as i32; // 380px logical / 2 * scale
                                let x = (position.x as i32 - half_w).max(0);
                                let y = position.y as i32 + 4;
                                let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|win, event| {
            if win.label() == "main" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = win.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::get_stats,
            commands::open_cli,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
