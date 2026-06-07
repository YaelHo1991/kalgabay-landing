use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterInfo {
    pub name: String,
    pub uri: String,
    pub host: String,
    pub port: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverResult {
    pub printers: Vec<PrinterInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintResult {
    pub success: bool,
    pub message: Option<String>,
}

/// Initialize the Android print plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R, ()>::new("android-print")
        .setup(|_app, _api| {
            // On Android, the Kotlin plugin handles all commands via JNI
            // This Rust side just initializes the plugin
            Ok(())
        })
        .build()
}
