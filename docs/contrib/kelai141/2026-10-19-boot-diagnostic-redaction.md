# 启动诊断出口脱敏

#421 第 9 项成立。boot-diag.log 的独立写盘出口未经过 EngineAuth.redact，HTTP 错误中的 token URL 可明文入档。现在整行格式化后统一脱敏，再进入旧轮转和追加逻辑；不修改引擎原日志与认证提取链。

验证：gradlew.bat :app:testDebugUnitTest --tests com.dsharnessmobile.shell.LogRedactionTest --no-daemon --max-workers=4，通过。新增实际 boot 行格式化用例，保留错误码，移除 URL token 并规范换行。未做设备验证。
