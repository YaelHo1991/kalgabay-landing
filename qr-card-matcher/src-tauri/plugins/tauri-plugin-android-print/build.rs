const COMMANDS: &[&str] = &["discoverPrinters", "printPdf", "stopDiscovery", "openPdf"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();

    // Set mobile cfg for Android
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    if target_os == "android" || target_os == "ios" {
        println!("cargo:rustc-cfg=mobile");
    }
}
