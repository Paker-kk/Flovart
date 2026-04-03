// Flovart - 桌面端主入口
// 防止 Windows 上双击启动时弹出额外的控制台窗口

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    flovart_lib::run()
}
