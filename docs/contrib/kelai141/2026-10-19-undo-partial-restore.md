# 快照部分恢复的准确回执

关联 #428 第 11 项。主配置文件在快照缺失或名称不受当前版本支持时，原实现静默跳过。现在与插件、profile 分支一致记入 missing，保留当前文件不动。

页面将 missing 作为部分恢复警示显示，使用中英文文案，并取消这种结果的自动重载；避免 350ms 后提示消失。REST 仍保持原有 ok 与 missing 契约，工具端原有详细渲染继续可用。

验证：node --test scripts/source-build/undo-partial-restore.test.mjs，2 项通过。使用隔离 fixture 验证缺文件时旧配置字节不变，并执行真实 client.js 的回执与重载函数，验证部分恢复不会被报成全成功。未做设备验证，尚不能声明界面验收完成。
