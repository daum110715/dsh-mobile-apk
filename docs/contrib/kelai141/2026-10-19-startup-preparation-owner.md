# 启动准备失败归还世代所有权

#421 第 7 项成立。主线程取得 token 后，准备 UI 和创建/启动 worker 的异常不经过 worker finally，可能留下 running latch。现在由 StartupFlowOwnership.handoff 覆盖 prepare、attach、Thread.start，异常归还本代 token，失效准备不启动线程；UI 用既有失败出口显示原因。

验证：gradlew.bat :app:testDebugUnitTest --tests com.dsharnessmobile.shell.StartupLifecycleOwnershipTest --tests com.dsharnessmobile.shell.EngineProbeTest --tests com.dsharnessmobile.shell.EngineAuthPolicyTest --no-daemon --max-workers=4，通过。新增主线程准备抛错、Thread.start 抛错和取消准备后的再次 begin 验证；原过期 finally/归属门用例保持通过。未做设备验证。没有放松认证和进程所有权，也未删除运行时文件。
