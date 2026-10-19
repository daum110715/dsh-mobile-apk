# 修复工具凭据保护统一

#421 第 8 项成立。列表隐藏 deepseek-key.txt 与 dashscope-key.txt，但直接路径的读写闸门只拒绝 credentials.yaml。现在实际访问检查复用同一受保护文件名集合，保持原文件字节不变。

验证：gradlew.bat :app:testDebugUnitTest --tests com.dsharnessmobile.shell.RepairToolsTest --no-daemon --max-workers=4，通过。新增两种 API key 文件的读写拒绝与旧字节不变断言。未做设备验证；这是源码与 JVM 证据，不能替代三层验收。
