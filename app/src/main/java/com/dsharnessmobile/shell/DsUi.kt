package com.dsharnessmobile.shell

import android.content.res.ColorStateList
import android.graphics.drawable.ClipDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.animation.PathInterpolator

/**
 * Shared drawables, motion, and press feedback for the native shell UI.
 *
 * Enter eases out, exit eases in, and exit durations are 0.7× the matching enter.
 * Skeleton motion does not overshoot. Call sites that already use [ease] follow [easeEnter].
 */
internal object DsUi {
  const val PRESS_IN_MS = 112L
  const val PRESS_OUT_MS = 160L
  const val ENTER_MS = 240L
  const val EXIT_MS = 168L
  const val SLOW_MS = 340L
  const val EXIT_SLOW_MS = 238L

  /** Emphasized decelerate. Shared by entrances, press release, and [ease]. */
  val easeEnter = PathInterpolator(0.05f, 0.7f, 0.1f, 1f)

  /** Emphasized accelerate. Shared by press-in and fade-out. */
  val easeExit = PathInterpolator(0.3f, 0f, 0.8f, 0.15f)

  val ease = easeEnter

  /**
   * 动效总开关（0.13.8 G3-M11，降级统一入口）：系统「关闭动画」三开关任一关闭、
   * 或 ValueAnimator 不活动（省电模式等）→ 所有 overlay 动效直接设终态。
   * 复用 ShimmerTextView.kt 的既有判定口径（单一来源原则）。
   */
  fun animationsEnabled(context: android.content.Context): Boolean {
    if (!android.animation.ValueAnimator.areAnimatorsEnabled()) return false
    val resolver = context.contentResolver
    val scale = { key: String -> android.provider.Settings.Global.getFloat(resolver, key, 1f) }
    return scale(android.provider.Settings.Global.ANIMATOR_DURATION_SCALE) != 0f &&
      scale(android.provider.Settings.Global.TRANSITION_ANIMATION_SCALE) != 0f &&
      scale(android.provider.Settings.Global.WINDOW_ANIMATION_SCALE) != 0f
  }

  fun roundRect(
    color: Int,
    radius: Float,
    strokeColor: Int? = null,
    strokePx: Int = 1,
  ): GradientDrawable = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radius
    if (strokeColor != null) setStroke(strokePx, strokeColor)
  }

  fun oval(color: Int): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.OVAL
    setColor(color)
  }

  fun ripple(fill: GradientDrawable, rippleColor: Int): RippleDrawable {
    val mask = GradientDrawable().apply {
      setColor(0xFFFFFFFF.toInt())
      cornerRadius = fill.cornerRadius
    }
    return RippleDrawable(ColorStateList.valueOf(rippleColor), fill, mask)
  }

  fun progressLayer(trackColor: Int, fillColor: Int, radius: Float): LayerDrawable {
    val track = GradientDrawable().apply {
      setColor(trackColor)
      cornerRadius = radius
    }
    val fill = GradientDrawable().apply {
      setColor(fillColor)
      cornerRadius = radius
    }
    val clip = ClipDrawable(fill, Gravity.START, ClipDrawable.HORIZONTAL)
    return LayerDrawable(arrayOf(track, clip)).apply {
      setId(0, android.R.id.background)
      setId(1, android.R.id.progress)
    }
  }

  /**
   * Press scales the view down, then back, without a bounce.
   * The listener returns false so the view still receives the click.
   *
   * @param view target of the press
   * @param scale scale while the pointer is down
   */
  fun bindPressScale(view: View, scale: Float = 0.97f) {
    view.setOnTouchListener { v, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> applyPressScale(v, scale, PRESS_IN_MS, easeExit)
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> applyPressScale(v, 1f, PRESS_OUT_MS, easeEnter)
      }
      false
    }
  }

  private fun applyPressScale(view: View, scale: Float, duration: Long, interpolator: android.view.animation.Interpolator) {
    if (!animationsEnabled(view.context)) {
      view.animate().cancel()
      view.scaleX = scale
      view.scaleY = scale
      return
    }
    view.animate().scaleX(scale).scaleY(scale).setDuration(duration).setInterpolator(interpolator).start()
  }
}
