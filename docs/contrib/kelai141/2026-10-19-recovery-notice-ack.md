# 恢复提示收到页面确认后再消费

#428 第 14、15 项成立。evaluateJavascript 已派发不等于页面执行成功；旧代码立即删 pending marker，内存旧提示又会压过新问题。

现在由异步回调返回 true、页面世代仍有效、磁盘 pending 仍是本条提示后才消费并记忆。重复回调只结算一次；新 pending 优先，事务 marker 和失败原因都消失后忘记旧内存提示并撤掉旧 DOM。注入失败保留原 marker，重载可补发。

验证：gradlew.bat :app:testDebugUnitTest --tests com.dsharnessmobile.shell.SnapshotRecoveryNoticeTest --tests com.dsharnessmobile.shell.StartupLifecycleOwnershipTest --no-daemon --max-workers=4，通过。新增异步确认前不得消费、世代失效不得消费、重复确认只消费一次、新提示优先与收敛遗忘断言。未做设备验证；真实 WebView 回调仍待候选三层验收。
