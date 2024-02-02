import {
  computed,
  getCurrentInstance,
  isVNode,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  unref,
  useSlots,
  watch,
} from 'vue'
import { throttle } from 'lodash-unified'
import { useResizeObserver } from '@vueuse/core'
import { debugWarn, flattedChildren, isString } from '@element-plus/utils'
import { useOrderedChildren } from '@element-plus/hooks'
import { carouselContextKey } from './constants'

import type { SetupContext } from 'vue'
import type { CarouselItemContext } from './constants'
import type { CarouselEmits, CarouselProps } from './carousel'

const THROTTLE_TIME = 300

export const useCarousel = (
  props: CarouselProps,
  emit: SetupContext<CarouselEmits>['emit'],
  componentName: string
) => {
  const {
    children: items, //起别名了
    addChild: addItem,
    removeChild: removeItem,
  } = useOrderedChildren<CarouselItemContext>(
    getCurrentInstance()!,
    'ElCarouselItem'
  )

  const slots = useSlots()

  // refs
  const activeIndex = ref(-1)
  const timer = ref<ReturnType<typeof setInterval> | null>(null)
  const hover = ref(false)
  const root = ref<HTMLDivElement>()
  const containerHeight = ref<number>(0)
  const isItemsTwoLength = ref(true) // item的个数是否为两个

  // computed 页面是否显示左右箭头 (never和垂直方向时，不显示箭头咯)
  const arrowDisplay = computed(
    () => props.arrow !== 'never' && !unref(isVertical)
  )
  // 幻灯片所对应的指示器是否有本文
  const hasLabel = computed(() => {
    return items.value.some((item) => item.props.label.toString().length > 0)
  })

  const isCardType = computed(() => props.type === 'card')
  const isVertical = computed(() => props.direction === 'vertical')

  const containerStyle = computed(() => {
    if (props.height !== 'auto') {
      return {
        height: props.height,
      }
    }
    // 自动高度
    // 当 carousel <code>的<code> height 设置为 auto时， carousel 的高度将根据子内容的高度自动设置
    return {
      height: `${containerHeight.value}px`,
      overflow: 'hidden',
    }
  })

  // methods
  // ✅ 处理左右箭头的click事件
  const throttledArrowClick = throttle(
    (index: number) => {
      setActiveItem(index)
    },
    THROTTLE_TIME,
    { trailing: true }
  )

  const throttledIndicatorHover = throttle((index: number) => {
    handleIndicatorHover(index)
  }, THROTTLE_TIME)

  // ✅用来处理只有2个item时的指示器的显示/隐藏
  // （当只有两个item时，会用PlaceholderItem增加两个使得item个数为四个。）
  // index为0 1，时隐藏 23，index为23时，隐藏01
  const isTwoLengthShow = (index: number) => {
    // 如果 isItemsTwoLength 的值为 false，直接返回 true
    if (!isItemsTwoLength.value) return true
    return activeIndex.value <= 1 ? index <= 1 : index > 1
  }

  // ✅
  function pauseTimer() {
    if (timer.value) {
      clearInterval(timer.value)
      timer.value = null
    }
  }

  // ✅
  function startTimer() {
    if (props.interval <= 0 || !props.autoplay || timer.value) return
    timer.value = setInterval(() => playSlides(), props.interval)
  }
  // ✅ 播放咯
  const playSlides = () => {
    if (activeIndex.value < items.value.length - 1) {
      activeIndex.value = activeIndex.value + 1 // +1
    } else if (props.loop) {
      activeIndex.value = 0
    }
  }
  //设置活跃item
  function setActiveItem(index: number | string) {
    if (isString(index)) {
      const filteredItems = items.value.filter(
        (item) => item.props.name === index
      )
      if (filteredItems.length > 0) {
        index = items.value.indexOf(filteredItems[0])
      }
    }
    // 将 index 转换为数字类型，如果无法转换或转换后的值不是整数，则输出警告信息并返回
    index = Number(index)
    if (Number.isNaN(index) || index !== Math.floor(index)) {
      debugWarn(componentName, 'index must be integer.')
      return
    }
    const itemCount = items.value.length
    const oldIndex = activeIndex.value
    if (index < 0) {
      // 如果 index < 0，则设置为最后一项的索引（如果循环）或者第一项的索引（如果不循环）
      activeIndex.value = props.loop ? itemCount - 1 : 0
    } else if (index >= itemCount) {
      // 如果 index >= itemCount，则设置为第一项的索引（如果循环）或者最后一项的索引（如果不循环）。
      activeIndex.value = props.loop ? 0 : itemCount - 1
    } else {
      activeIndex.value = index
    }
    if (oldIndex === activeIndex.value) {
      resetItemPosition(oldIndex) //重置激活项的位置
    }
    //重置轮播定时器
    resetTimer()
  }

  function resetItemPosition(oldIndex?: number) {
    items.value.forEach((item, index) => {
      item.translateItem(index, activeIndex.value, oldIndex)
    })
  }
  // 这是给卡片类型用的吧
  function itemInStage(item: CarouselItemContext, index: number) {
    const _items = unref(items)
    const itemCount = _items.length
    if (itemCount === 0 || !item.states.inStage) return false
    const nextItemIndex = index + 1
    const prevItemIndex = index - 1
    const lastItemIndex = itemCount - 1
    const isLastItemActive = _items[lastItemIndex].states.active
    const isFirstItemActive = _items[0].states.active
    const isNextItemActive = _items[nextItemIndex]?.states?.active
    const isPrevItemActive = _items[prevItemIndex]?.states?.active

    if ((index === lastItemIndex && isFirstItemActive) || isNextItemActive) {
      return 'left'
    } else if ((index === 0 && isLastItemActive) || isPrevItemActive) {
      return 'right'
    }
    return false
  }

  function handleMouseEnter() {
    hover.value = true
    if (props.pauseOnHover) {
      pauseTimer()
    }
  }

  function handleMouseLeave() {
    hover.value = false
    startTimer()
  }

  // ✅ 处理左右箭头的鼠标悬停事件
  function handleButtonEnter(arrow: 'left' | 'right') {
    if (unref(isVertical)) return
    items.value.forEach((item, index) => {
      if (arrow === itemInStage(item, index)) {
        item.states.hover = true
      }
    })
  }
  // ✅ 处理左右箭头的鼠标悬停事件
  function handleButtonLeave() {
    if (unref(isVertical)) return
    items.value.forEach((item) => {
      item.states.hover = false
    })
  }

  // ✅
  function handleIndicatorClick(index: number) {
    activeIndex.value = index
  }
  // ✅
  function handleIndicatorHover(index: number) {
    if (props.trigger === 'hover' && index !== activeIndex.value) {
      activeIndex.value = index
    }
  }

  function prev() {
    setActiveItem(activeIndex.value - 1)
  }

  function next() {
    setActiveItem(activeIndex.value + 1)
  }

  function resetTimer() {
    pauseTimer()
    if (!props.pauseOnHover) startTimer()
  }

  function setContainerHeight(height: number) {
    if (props.height !== 'auto') return
    containerHeight.value = height
  }
  // ✅这个方法是为了处理2个item的报错吧(让两个变成4个)
  function PlaceholderItem() {
    // fix: https://github.com/element-plus/element-plus/issues/12139
    // 拿carousel组件中的默认插槽（也就是拿carousel-item）
    const defaultSlots = slots.default?.()
    if (!defaultSlots) return null

    const flatSlots = flattedChildren(defaultSlots) // 展平 {[{item1},{item2}]} => [{item1},{item2}]

    const carouselItemsName = 'ElCarouselItem'

    const normalizeSlots = flatSlots.filter((slot) => {
      return isVNode(slot) && (slot.type as any).name === carouselItemsName
    })
    // 只有当item为2 且 循环滚动 且 不是卡片时返回 -> [{},{}]
    // 否则返回null
    if (normalizeSlots?.length === 2 && props.loop && !isCardType.value) {
      isItemsTwoLength.value = true
      return normalizeSlots
    }
    isItemsTwoLength.value = false
    return null
  }

  // watch
  watch(
    () => activeIndex.value,
    (current, prev) => {
      resetItemPosition(prev)
      if (isItemsTwoLength.value) {
        current = current % 2
        prev = prev % 2
      }
      if (prev > -1) {
        emit('change', current, prev) // 幻灯片切换时触发
      }
    }
  )
  watch(
    () => props.autoplay,
    (autoplay) => {
      autoplay ? startTimer() : pauseTimer()
    }
  )
  watch(
    () => props.loop,
    () => {
      setActiveItem(activeIndex.value)
    }
  )

  watch(
    () => props.interval,
    () => {
      resetTimer()
    }
  )

  const resizeObserver = shallowRef<ReturnType<typeof useResizeObserver>>()
  // lifecycle
  onMounted(() => {
    // 为什么要把watch放到omMounted中?
    // 将 watch 放置在 onMounted 钩子中的原因是确保在carousel-item组件挂载后才开始监视 items.value 的变化。
    watch(
      () => items.value,
      () => {
        if (items.value.length > 0) setActiveItem(props.initialIndex)
      },
      {
        immediate: true,
      }
    )

    resizeObserver.value = useResizeObserver(root.value, () => {
      resetItemPosition()
    })
    startTimer()
  })

  onBeforeUnmount(() => {
    pauseTimer()
    if (root.value && resizeObserver.value) resizeObserver.value.stop()
  })

  // provide 这些值都注入给item了
  provide(carouselContextKey, {
    root,
    isCardType,
    isVertical,
    items,
    loop: props.loop,
    addItem,
    removeItem,
    setActiveItem,
    setContainerHeight,
  })

  return {
    root,
    activeIndex,
    arrowDisplay,
    hasLabel,
    hover,
    isCardType,
    items,
    isVertical,
    containerStyle,
    isItemsTwoLength,
    handleButtonEnter,
    handleButtonLeave,
    handleIndicatorClick,
    handleMouseEnter,
    handleMouseLeave,
    setActiveItem,
    prev,
    next,
    PlaceholderItem,
    isTwoLengthShow,
    throttledArrowClick,
    throttledIndicatorHover,
  }
}
