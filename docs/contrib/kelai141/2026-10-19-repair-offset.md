# 修复工具 offset 边界

#426 第 3 项成立。原实现只在 offset 小于 size 时 seek，越界 offset 会从头读取。现在总是定位到请求 offset：等于末尾返回空内容，大于末尾由既有 bad-offset 检查拒绝。

JVM RepairToolsTest 验证 0、正常分页、精确末尾和越界，且源文件字节不变。该测试已在本轮组合运行通过；未做设备验证。
