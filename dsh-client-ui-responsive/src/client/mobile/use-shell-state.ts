/**
 * 壳侧状态订阅钩子（ST-09 / ST-27：禁止裸写一次性桥读）。
 *
 * 「从系统设置返回」是本项目最高频、最容易踩的路径（F-UI-12）：在系统侧改了状态
 * （权限/开关/偏好）后回到页面，React 不会重挂载，一次性 `useState(() => bridge.getX())`
 * 读到的旧值会一直显示 —— 展示值与真源分裂。
 *
 * 本钩子统一提供：**挂载读一次 + `visibilitychange`/`focus` 重读 + 可选轮询**，
 * 并返回一个 `refresh()` 供"写后回读"（§4.5 七模式之五）使用。
 *
 * 纪律：组件里禁止「useState 初值器直读 window.androidBridge」这类一次性裸读（ST-27 的 grep 判据）；
 * 设备侧/壳侧状态一律经本钩子进入 React state（回归见 tests/shell-state-discipline.spec.ts）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface ShellStateOptions {
  /** 可见时的轮询间隔（毫秒）；缺省不轮询（只靠 visibilitychange/focus 重读）。 */
  pollMs?: number
}

/**
 * 壳侧状态是否值得提交给 React。
 *
 * 轮询 getter 多数会从 JSON 桥重新组装对象，同值对象每次引用都不同；只比较引用会让
 * 设置页每两秒全量重渲染。这里只比较可被桥传输的 JSON 值；无法序列化或包含循环引用时
 * 返回 false，允许调用方按新值提交（最坏是多渲染一次，不会漏掉真实更新）。
 */
export function sameShellState(prev: unknown, next: unknown): boolean {
  if (Object.is(prev, next)) return true
  try {
    return JSON.stringify(prev) === JSON.stringify(next)
  } catch {
    // 循环引用、BigInt 等不可传输值：保守地视为变化，避免错误地吞掉更新。
    return false
  }
}

/**
 * @param getter - 真源读函数（壳桥或由其派生的值）；必须同步、无副作用。
 * @param options - 可选轮询间隔。
 * @returns `[当前值, refresh]`：refresh 立即重读真源（供写后回读），失败保留上一次值。
 */
export function useShellState<T>(getter: () => T, options: ShellStateOptions = {}): readonly [T, () => void] {
  const getterRef = useRef(getter)
  getterRef.current = getter
  const [value, setValue] = useState<T>(() => {
    try {
      return getter()
    } catch {
      /* 真源不可读（桌面宿主/桥缺席）：初值只能是 undefined，由调用方的兜底决定展示 */
      return undefined as unknown as T
    }
  })

  const refresh = useCallback((): void => {
    let next: T
    try {
      next = getterRef.current()
    } catch {
      return // 读失败保留上一次值：绝不把状态打成 undefined 或旧值清零
    }
    setValue((prev) => (sameShellState(prev, next) ? prev : next))
  }, [])

  const pollMs = options.pollMs
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const timer = pollMs !== undefined && pollMs > 0 ? window.setInterval(onVisible, pollMs) : undefined
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [refresh, pollMs])

  return [value, refresh] as const
}
