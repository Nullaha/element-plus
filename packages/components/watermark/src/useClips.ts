import type { WatermarkProps } from './watermark'

export const FontGap = 3

function prepareCanvas(
  width: number,
  height: number,
  ratio = 1
): [
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  realWidth: number,
  realHeight: number
] {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const realWidth = width * ratio
  const realHeight = height * ratio
  canvas.setAttribute('width', `${realWidth}px`)
  canvas.setAttribute('height', `${realHeight}px`)
  ctx.save() // 用来保存最近一次的Canvas的状态和属性。

  return [ctx, canvas, realWidth, realHeight]
}

/**
 * Get the clips of text content.
 * This is a lazy hook function since SSR no need this
 */
export default function useClips() {
  // Get single clips
  function getClips(
    content: NonNullable<WatermarkProps['content']> | HTMLImageElement,
    rotate: number,
    ratio: number,
    width: number, //markWidth
    height: number, //markHeight
    font: Required<NonNullable<WatermarkProps['font']>>,
    gapX: number,
    gapY: number
  ): [dataURL: string, finalWidth: number, finalHeight: number] {
    // ================= Text / Image =================
    const [ctx, canvas, contentWidth, contentHeight] = prepareCanvas(
      width,
      height,
      ratio
    )

    if (content instanceof HTMLImageElement) {
      // Image
      ctx.drawImage(content, 0, 0, contentWidth, contentHeight)
    } else {
      // Text
      const {
        color,
        fontSize,
        fontStyle,
        fontWeight,
        fontFamily,
        textAlign,
        textBaseline,
      } = font
      const mergedFontSize = Number(fontSize) * ratio

      ctx.font = `${fontStyle} normal ${fontWeight} ${mergedFontSize}px/${height}px ${fontFamily}`
      ctx.fillStyle = color
      ctx.textAlign = textAlign
      ctx.textBaseline = textBaseline
      const contents = Array.isArray(content) ? content : [content] //[]
      //在画布上绘制一组文本，每一行文本都水平居中，而垂直位置则根据行的索引和字体大小计算得出，以实现文字的垂直居中排列
      contents?.forEach((item, index) => {
        ctx.fillText(
          item ?? '',
          contentWidth / 2,
          index * (mergedFontSize + FontGap * ratio)
        )
      })
    }

    // ==================== Rotate ====================
    const angle = (Math.PI / 180) * Number(rotate) //弧度
    const maxSize = Math.max(width, height)
    const [rCtx, rCanvas, realMaxSize] = prepareCanvas(maxSize, maxSize, ratio)

    // Copy from `ctx` and rotate
    //  1 通过 translate 将原点移到旋转后画布的中心。
    //  2 对画布进行旋转
    //  3 使用drawImage将原始画布 (canvas) 的内容绘制到旋转后的画布 (rCanvas) 上。
    rCtx.translate(realMaxSize / 2, realMaxSize / 2)
    rCtx.rotate(angle)
    if (contentWidth > 0 && contentHeight > 0) {
      // drawImage(img,dx,dy),,dx,dy 是指目标图像的左上角在画布上的坐标
      rCtx.drawImage(canvas, -contentWidth / 2, -contentHeight / 2)
    }

    // Get boundary of rotated text
    // 1 通过遍历四个角的坐标并应用旋转，计算旋转后的文本的左、右、上、下边界。
    function getRotatePos(x: number, y: number) {
      // 该函数就是通过旋转矩阵求旋转后的坐标 (targetX, targetY) ，可以直接看我的印象笔记
      // (x_new,y_new) = [M](x,y)
      // x_new = Ax+By
      // y_new = Cx+Dy
      // 求M:
      // [A,B]  => [ cos, -sin ]
      // [C,D]  => [ sin,  cos ]

      const targetX = x * Math.cos(angle) - y * Math.sin(angle)
      const targetY = x * Math.sin(angle) + y * Math.cos(angle)
      return [targetX, targetY]
    }

    let left = 0
    let right = 0
    let top = 0
    let bottom = 0

    const halfWidth = contentWidth / 2
    const halfHeight = contentHeight / 2
    const points = [
      [0 - halfWidth, 0 - halfHeight],
      [0 + halfWidth, 0 - halfHeight],
      [0 + halfWidth, 0 + halfHeight],
      [0 - halfWidth, 0 + halfHeight],
    ]
    // TODO: 我有一个问题，points的坐标不就是基于旋转后的新坐标确定的每个点的坐标值吗，为什么还需要对每个点再求旋转后的坐标值？
    points.forEach(([x, y]) => {
      const [targetX, targetY] = getRotatePos(x, y)
      left = Math.min(left, targetX)
      right = Math.max(right, targetX)
      top = Math.min(top, targetY)
      bottom = Math.max(bottom, targetY)
    })
    // 为了最后在rCtx画布上切图像用(其实就是在原画布中扣出来了图像)
    const cutLeft = left + realMaxSize / 2
    const cutTop = top + realMaxSize / 2
    const cutWidth = right - left
    const cutHeight = bottom - top

    // ================ Fill Alternate ================
    const realGapX = gapX * ratio
    const realGapY = gapY * ratio
    const filledWidth = (cutWidth + realGapX) * 2 // 最终mark画布的大小
    const filledHeight = cutHeight + realGapY

    const [fCtx, fCanvas] = prepareCanvas(filledWidth, filledHeight)

    function drawImg(targetX = 0, targetY = 0) {
      // (targetX,targetY)是画布上要放置左上角的位置
      // rCanvas,
      //   cutLeft,
      //   cutTop,
      //   cutWidth,
      //   cutHeight, 前5个参数，相当于去rCanvas里抠图了
      fCtx.drawImage(
        rCanvas,
        cutLeft,
        cutTop,
        cutWidth,
        cutHeight,
        targetX,
        targetY,
        cutWidth,
        cutHeight
      )
    }
    drawImg() // fCanvas画布原点画一个
    drawImg(cutWidth + realGapX, -cutHeight / 2 - realGapY / 2)
    drawImg(cutWidth + realGapX, +cutHeight / 2 + realGapY / 2) // fCanvas画布大约中心位置画一个

    return [fCanvas.toDataURL(), filledWidth / ratio, filledHeight / ratio]
  }

  return getClips
}
