use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

mod commands;
mod db;
mod sync;

fn spawn_sync(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let status = sync::sync_db().await;

        // Reopen connection when DB file was replaced
        if matches!(status, sync::SyncStatus::Updated) {
            if let Ok(new_conn) = db::open() {
                let state = app.state::<db::DbState>();
                if let Ok(mut guard) = state.0.lock() {
                    *guard = new_conn;
                };
            }
        }

        let _ = app.emit("db-synced", &status);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let db = db::open()?;
            app.manage(db::DbState(std::sync::Mutex::new(db)));

            // Background sync on startup
            spawn_sync(app.handle().clone());

            // Periodic background sync — fires every 1h while the app is running.
            // Tray-click is the only other trigger, and users often leave the menubar
            // app running for days without opening the tray.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(3600));
                    spawn_sync(handle.clone());
                }
            });

            let quit = MenuItem::with_id(app, "quit", "Quit ossdive", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            TrayIconBuilder::new()
                .icon(tauri::include_image!("icons/tray.png"))
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
                                let scale  = win.scale_factor().unwrap_or(1.0);
                                let half_w = (190.0 * scale) as i32;
                                let x      = (position.x as i32 - half_w).max(0);
                                let y      = position.y as i32 + 4;
                                let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
                                let _ = win.show();
                                let _ = win.set_focus();

                                // Background sync on tray open (1h TTL inside sync_db)
                                spawn_sync(app.clone());
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
