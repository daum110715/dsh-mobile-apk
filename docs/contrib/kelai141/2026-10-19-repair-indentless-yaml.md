# 修复配置解析支持无额外缩进的序列

#421 第 10 项成立。YAML 允许 mapping 的序列值与键同缩进。迷你解析器原来把它当空 mapping；现在仅在 mapping value 位置接受该形态，空序列项仍不会吞掉下个 sibling。

验证：gradlew.bat :app:testDebugUnitTest --tests com.dsharnessmobile.shell.RepairYamlTest --tests com.dsharnessmobile.shell.RepairModelConfigTest --tests com.dsharnessmobile.shell.RepairToolsTest --no-daemon --max-workers=4，通过。覆盖顶层plugins、嵌套models、后续字段和空列表项。只改读取解析，不重写用户配置。未做设备验证。
