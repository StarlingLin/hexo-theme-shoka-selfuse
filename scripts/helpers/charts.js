'use strict'

const cheerio = require('cheerio')
const moment = require('moment')

hexo.extend.filter.register('after_render:html', function (html) {
  const $ = cheerio.load(html)
  const charts = [
    ['#posts-calendar', '#postsCalendar', postsCalendar],
    ['#posts-chart', '#postsChart', postsChart],
    ['#creation-clock-chart', '#creationClockChart', creationClockChart],
    ['#article-size-chart', '#articleSizeChart', articleSizeChart],
    ['#tags-chart', '#tagsChart', function () {
      return tagsChart($('#tags-chart').attr('data-length'))
    }],
    ['#categories-chart', '#categoriesChart', categoriesChart],
    ['#category-tag-sunburst', '#categoryTagSunburstChart', categoryTagSunburstChart]
  ]

  let changed = false
  charts.forEach(function (item) {
    const target = $(item[0])
    if (target.length && !$(item[1]).length) {
      target.after(item[2]())
      changed = true
    }
  })

  return changed ? $.root().html().replace(/&amp;#/g, '&#') : html
}, 15)

function jsonForScript (value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function collectionNames (collection) {
  const names = []
  if (!collection || typeof collection.forEach !== 'function') return names
  collection.forEach(function (item) {
    if (item && item.name) names.push(String(item.name))
  })
  return names
}

function leafCategoryItems (collection) {
  const categories = []
  if (!collection || typeof collection.forEach !== 'function') return categories
  collection.forEach(function (category) {
    if (category && category.name) categories.push(category)
  })

  const parentIds = new Set()
  categories.forEach(function (category) {
    if (category.parent) parentIds.add(String(category.parent))
  })

  return categories.filter(function (category) {
    return !parentIds.has(String(category._id))
  })
}

function categoryPath (category) {
  if (category && category.path) return String(category.path)
  return 'categories/' + encodeURIComponent(String(category.name)) + '/'
}

function postsCalendar () {
  const dateMap = new Map()
  const yearMap = new Map()

  hexo.locals.get('posts').forEach(function (post) {
    const date = moment(post.date).format('YYYY-MM-DD')
    const year = moment(post.date).year()
    dateMap.set(date, (dateMap.get(date) || 0) + 1)
    yearMap.set(year, (yearMap.get(year) || 0) + 1)
  })

  const availableYears = Array.from(yearMap.keys()).sort(function (a, b) {
    return b - a
  })
  const datePosts = []
  availableYears.forEach(function (year) {
    const start = moment.utc([year, 0, 1])
    const end = moment.utc([year, 11, 31])
    for (let day = start.clone(); !day.isAfter(end); day.add(1, 'day')) {
      const date = day.format('YYYY-MM-DD')
      datePosts.push([date, dateMap.get(date) || 0])
    }
  })

  return `
  <script type="text/x-shoka-statistics" id="postsCalendar">
  var postsCalendarElement = document.getElementById('posts-calendar')
  var postsCalendar = echarts.init(postsCalendarElement, 'light')
  var postsCalendarData = ${jsonForScript(datePosts)}
  var postsCalendarYears = ${jsonForScript(availableYears)}
  var postsCalendarYearCounts = ${jsonForScript(Object.fromEntries(yearMap))}
  var postsCalendarSelectedYear = postsCalendarYears[0]
  var postsCalendarRoot = document.documentElement

  function postsCalendarTheme () {
    var dark = postsCalendarRoot.getAttribute('data-theme') === 'dark'
    var text = window.getComputedStyle(document.body).color || (dark ? '#f5f5f5' : '#333')
    var axis = dark ? 'rgba(255,220,212,.13)' : 'rgba(191,145,132,.2)'
    return {
      dark: dark,
      text: text,
      axis: axis,
      background: dark ? '#30313a' : '#fffaf8',
      heat: dark
        ? ['#343238', '#69444a', '#9d515c', '#cc5e6f', '#ed7b8e']
        : ['#f7eeee', '#f2d5d7', '#eba9af', '#e57c89', '#d95269']
    }
  }

  function postsCalendarRenderYears () {
    var navigation = document.getElementById('posts-calendar-years')
    if (!navigation) return
    navigation.innerHTML = ''
    postsCalendarYears.forEach(function (year) {
      var count = Number(postsCalendarYearCounts[year] || 0)
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'statistics-calendar-year' + (year === postsCalendarSelectedYear ? ' is-active' : '')
      button.dataset.year = String(year)
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-selected', year === postsCalendarSelectedYear ? 'true' : 'false')
      button.setAttribute('aria-label', year + ' 年，共 ' + count + ' 篇文章')
      button.innerHTML = '<span class="statistics-calendar-year__value">' + year + '</span>' +
        '<small class="statistics-calendar-year__count">' + count + ' 篇</small>'
      button.addEventListener('click', function () {
        postsCalendarSelectedYear = year
        postsCalendarRenderYears()
        postsCalendarRender()
      })
      navigation.appendChild(button)
    })
  }

  function postsCalendarRender () {
    if (!postsCalendarSelectedYear) return
    var theme = postsCalendarTheme()
    var compact = postsCalendarElement.clientWidth < 520
    var yearData = postsCalendarData.filter(function (item) {
      return item[0].slice(0, 4) === String(postsCalendarSelectedYear)
    })
    var maximum = yearData.reduce(function (value, item) {
      return Math.max(value, Number(item[1]) || 0)
    }, 1)
    var yearLabel = document.getElementById('posts-calendar-year-label')
    var yearCount = document.getElementById('posts-calendar-year-count')
    if (yearLabel) yearLabel.textContent = postsCalendarSelectedYear
    if (yearCount) yearCount.textContent = Number(postsCalendarYearCounts[postsCalendarSelectedYear] || 0) + ' 篇文章'

    postsCalendar.setOption({
      animationDuration: 650,
      textStyle: { color: theme.text },
      tooltip: {
        backgroundColor: 'rgba(36, 31, 48, .94)',
        borderWidth: 0,
        textStyle: { color: '#fff' },
        formatter: function (params) {
          return '<span style="color:#ead0cc">' + params.value[0] + '</span>　<strong style="color:#ffb5aa">' + params.value[1] + '</strong> 篇'
        }
      },
      visualMap: {
        min: 0,
        max: maximum,
        calculable: false,
        orient: 'horizontal',
        right: compact ? 18 : 24,
        bottom: 9,
        itemWidth: 10,
        itemHeight: 80,
        text: ['多', '少'],
        textGap: 7,
        textStyle: { color: theme.text, fontSize: 9 },
        inRange: { color: theme.heat }
      },
      calendar: {
        top: compact ? 46 : 48,
        left: compact ? 36 : 48,
        right: compact ? 18 : 28,
        bottom: 42,
        range: String(postsCalendarSelectedYear),
        cellSize: ['auto', compact ? 13 : 15],
        splitLine: { show: false },
        itemStyle: { color: theme.background, borderColor: theme.axis, borderWidth: .6 },
        yearLabel: { show: false },
        monthLabel: { nameMap: 'cn', color: theme.text, fontSize: 10, margin: 9 },
        dayLabel: { nameMap: 'cn', firstDay: 1, color: theme.text, fontSize: 9, margin: 6 }
      },
      series: [{
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: yearData,
        emphasis: { itemStyle: { shadowBlur: 9, shadowColor: 'rgba(233,84,107,.42)' } }
      }]
    }, true)
  }

  postsCalendarRenderYears()
  postsCalendarRender()
  window.ShokaStatisticsCharts.register(postsCalendar, function () {
    postsCalendar.resize()
    postsCalendarRender()
  })
  </script>`
}

function postsChart () {
  const posts = hexo.locals.get('posts')
  const dates = []
  posts.forEach(function (post) {
    dates.push(moment(post.date).startOf('month'))
  })
  const now = moment().startOf('month')
  const start = dates.length
    ? dates.reduce(function (minimum, date) { return date.isBefore(minimum) ? date : minimum }, dates[0]).clone()
    : now.clone()
  const latest = dates.length
    ? dates.reduce(function (maximum, date) { return date.isAfter(maximum) ? date : maximum }, dates[0]).clone()
    : now.clone()
  const end = latest.isAfter(now) ? latest : now
  const monthMap = new Map()
  for (let cursor = start.clone(); !cursor.isAfter(end); cursor.add(1, 'month')) {
    monthMap.set(cursor.format('YYYY-MM'), 0)
  }
  posts.forEach(function (post) {
    const month = moment(post.date).format('YYYY-MM')
    monthMap.set(month, (monthMap.get(month) || 0) + 1)
  })

  return `
  <script type="text/x-shoka-statistics" id="postsChart">
  var postsChart = echarts.init(document.getElementById('posts-chart'), 'light')
  var postsChartMonths = ${jsonForScript(Array.from(monthMap.keys()))}
  var postsChartValues = ${jsonForScript(Array.from(monthMap.values()))}
  var postsChartRange = document.getElementById('posts-chart-range')
  var postsChartEmpty = document.getElementById('posts-chart-empty')
  var postsChartRangeChanging = false
  var postsChartRoot = document.documentElement
  var postsChartDark = postsChartRoot.getAttribute('data-theme') === 'dark'
  var postsChartTextColor = window.getComputedStyle(document.body).color || (postsChartDark ? '#f5f5f5' : '#333')
  var postsChartAxisColor = window.getComputedStyle(postsChartRoot).getPropertyValue('--grey-4').trim() || postsChartTextColor
  var postsChartSplitColor = postsChartDark ? 'rgba(255,220,212,.085)' : 'rgba(148,104,93,.1)'

  function postsChartVisibleIndexes () {
    var zoom = (postsChart.getOption().dataZoom || [])[0] || {}
    var last = Math.max(0, postsChartMonths.length - 1)
    var start = typeof zoom.startValue === 'number' ? zoom.startValue : postsChartMonths.indexOf(zoom.startValue)
    var end = typeof zoom.endValue === 'number' ? zoom.endValue : postsChartMonths.indexOf(zoom.endValue)
    if (start < 0) start = Math.round((Number(zoom.start) || 0) / 100 * last)
    if (end < 0) end = Math.round((Number(zoom.end) || 100) / 100 * last)
    return [Math.max(0, start), Math.min(last, end)]
  }

  function postsChartUpdateEmpty () {
    if (!postsChartEmpty) return
    var indexes = postsChartVisibleIndexes()
    var hasPost = postsChartValues.slice(indexes[0], indexes[1] + 1).some(function (value) { return value > 0 })
    postsChartEmpty.classList.toggle('is-visible', !hasPost)
  }

  function postsChartApplyRange (value) {
    if (!postsChartMonths.length || value === 'custom') return
    var length = value === 'all' ? postsChartMonths.length : Math.max(1, Number(value) || 6)
    var startIndex = Math.max(0, postsChartMonths.length - length)
    postsChartRangeChanging = true
    postsChart.setOption({ dataZoom: [{ startValue: startIndex, endValue: postsChartMonths.length - 1 }, { startValue: startIndex, endValue: postsChartMonths.length - 1 }] })
    window.setTimeout(function () {
      postsChartRangeChanging = false
      postsChartUpdateEmpty()
    }, 0)
  }

  postsChart.setOption({
    animationDuration: 900,
    animationEasing: 'cubicOut',
    textStyle: { color: postsChartTextColor },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(36, 31, 48, .94)',
      borderWidth: 0,
      padding: [9, 12],
      textStyle: { color: '#fff' },
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(233, 84, 107, .48)', width: 1 } },
      formatter: function (params) {
        var point = params[0]
        return '<div style="font-size:12px;color:#c9c2d4">' + point.axisValue + '</div>' +
          '<div style="margin-top:3px"><span style="display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#e9546b"></span>' +
          '<strong style="color:#ffb8ae">' + point.value + '</strong> 篇文章</div>'
      }
    },
    grid: { top: 28, left: 48, right: 24, bottom: 68 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: postsChartMonths,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: postsChartAxisColor } },
      axisLabel: { color: postsChartTextColor, hideOverlap: true, margin: 12 },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: '文章篇数',
      nameTextStyle: { color: postsChartTextColor, fontSize: 10 },
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: postsChartTextColor },
      splitLine: { show: true, lineStyle: { color: postsChartSplitColor, type: 'dashed' } }
    },
    dataZoom: [{
      type: 'inside',
      filterMode: 'none'
    }, {
      type: 'slider',
      filterMode: 'none',
      height: 18,
      bottom: 16,
      borderColor: 'transparent',
      backgroundColor: postsChartDark ? 'rgba(255,255,255,.045)' : 'rgba(148,104,93,.055)',
      fillerColor: 'rgba(233, 84, 107, .16)',
      handleStyle: { color: '#e9546b', borderColor: '#f3b0a8' },
      moveHandleStyle: { color: 'rgba(233, 84, 107, .34)' },
      textStyle: { color: postsChartTextColor }
    }],
    series: [{
      name: '文章篇数',
      type: 'line',
      smooth: true,
      showSymbol: false,
      symbolSize: 7,
      data: postsChartValues,
      lineStyle: { width: 2.5, color: '#e26d78' },
      itemStyle: { color: '#e9546b' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(233,84,107,.26)' }, { offset: 1, color: 'rgba(236,140,105,.02)' }])
      },
      emphasis: { focus: 'series' },
      markLine: {
        symbol: ['none', 'none'],
        label: { color: postsChartTextColor, formatter: '平均 {c}' },
        lineStyle: { color: 'rgba(236,140,105,.42)', type: 'dashed' },
        data: [{ type: 'average', name: '平均值' }]
      }
    }]
  })

  if (postsChartRange) {
    postsChartRange.addEventListener('change', function () { postsChartApplyRange(this.value) })
  }
  postsChart.on('datazoom', function () {
    if (!postsChartRangeChanging && postsChartRange) postsChartRange.value = 'custom'
    postsChartUpdateEmpty()
  })
  postsChartApplyRange(postsChartRange ? postsChartRange.value : '6')
  window.ShokaStatisticsCharts.register(postsChart, function () {
    postsChart.resize()
    postsChartUpdateEmpty()
  })
  </script>`
}

function creationClockChart () {
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const clockData = Array.from({ length: 24 }, function (_, hour) {
    return {
      value: 0,
      name: String(hour).padStart(2, '0') + ':00',
      breakdown: Array(7).fill(0)
    }
  })

  hexo.locals.get('posts').forEach(function (post) {
    const date = moment(post.date)
    const hour = date.hour()
    const weekday = (date.day() + 6) % 7
    clockData[hour].value += 1
    clockData[hour].breakdown[weekday] += 1
  })

  return `
  <script type="text/x-shoka-statistics" id="creationClockChart">
  var creationClockChart = echarts.init(document.getElementById('creation-clock-chart'), 'light')
  var creationClockData = ${jsonForScript(clockData)}
  var creationClockWeekdays = ${jsonForScript(weekdays)}
  var creationClockRoot = document.documentElement
  var creationClockDark = creationClockRoot.getAttribute('data-theme') === 'dark'
  var creationClockTextColor = window.getComputedStyle(document.body).color || (creationClockDark ? '#f5f5f5' : '#333')
  var creationClockAxisColor = creationClockDark ? 'rgba(255,220,212,.12)' : 'rgba(148,104,93,.12)'
  creationClockChart.setOption({
    animationDuration: 1000,
    animationEasing: 'cubicOut',
    textStyle: { color: creationClockTextColor },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(36, 31, 48, .94)',
      borderWidth: 0,
      padding: [9, 12],
      textStyle: { color: '#fff' },
      formatter: function (params) {
        var detail = (params.data.breakdown || []).map(function (count, index) {
          return count > 0 ? '<span style="color:#c9c2d4">' + creationClockWeekdays[index] + '</span> ' + count + ' 篇' : ''
        }).filter(Boolean).join('<br>')
        return '<strong style="color:#ffd1c9">' + params.name + '</strong>　<strong style="color:#ffad9f">' + params.value + '</strong> 篇文章' +
          (detail ? '<div style="margin-top:6px;line-height:1.65">' + detail + '</div>' : '<div style="margin-top:5px;color:#aaa">暂无发布记录</div>')
      }
    },
    polar: { center: ['50%', '49%'], radius: ['15%', '73%'] },
    angleAxis: {
      type: 'category',
      data: creationClockData.map(function (item) { return item.name }),
      startAngle: 90,
      clockwise: true,
      boundaryGap: true,
      axisLine: { lineStyle: { color: creationClockAxisColor } },
      axisTick: { show: false },
      axisLabel: {
        color: creationClockTextColor,
        fontSize: 9,
        interval: 1,
        formatter: function (value, index) { return index % 2 === 0 ? value.slice(0, 2) : '' }
      },
      splitLine: { show: true, lineStyle: { color: creationClockAxisColor } }
    },
    radiusAxis: {
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: creationClockAxisColor, type: 'dashed' } }
    },
    series: [{
      type: 'bar',
      coordinateSystem: 'polar',
      data: creationClockData,
      roundCap: true,
      barWidth: '68%',
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [{ offset: 0, color: '#ecaa72' }, { offset: .52, color: '#ec8c69' }, { offset: 1, color: '#e9546b' }]),
        opacity: .86,
        shadowBlur: 7,
        shadowColor: 'rgba(233,84,107,.2)'
      },
      emphasis: { itemStyle: { opacity: 1, shadowBlur: 15, shadowColor: 'rgba(233,84,107,.38)' } }
    }],
    graphic: [{
      type: 'group',
      left: 'center',
      top: 'middle',
      silent: true,
      children: [{ type: 'text', style: { text: '24H', fill: creationClockTextColor, font: '600 15px sans-serif', textAlign: 'center' } },
        { type: 'text', top: 18, style: { text: '创作时钟', fill: creationClockTextColor, opacity: .58, font: '9px sans-serif', textAlign: 'center' } }]
    }]
  })
  window.ShokaStatisticsCharts.register(creationClockChart, function () { creationClockChart.resize() })
  </script>`
}

function articleSizeChart () {
  const palette = ['#e9546b', '#ec8c69', '#dfa56c', '#d97893', '#c98672', '#ed7ead', '#b97970', '#e7b07c']
  const colorMap = new Map()
  const data = []

  hexo.locals.get('posts').forEach(function (post) {
    const categories = collectionNames(post.categories)
    const category = categories[0] || '未分类'
    if (!colorMap.has(category)) colorMap.set(category, palette[colorMap.size % palette.length])
    data.push({
      value: [moment(post.date).format('YYYY-MM-DD'), Number(post.length) || 0, String(post.title || '无标题'), category, String(post.path || '')],
      itemStyle: { color: colorMap.get(category) }
    })
  })

  data.sort(function (a, b) { return a.value[0].localeCompare(b.value[0]) })
  const categories = Array.from(colorMap, function (item) {
    return { name: item[0], color: item[1] }
  })

  return `
  <script type="text/x-shoka-statistics" id="articleSizeChart">
  var articleSizeChart = echarts.init(document.getElementById('article-size-chart'), 'light')
  var articleSizeData = ${jsonForScript(data)}
  var articleSizeCategories = ${jsonForScript(categories)}
  var articleSizeRootPath = ${jsonForScript(hexo.config.root || '/')}
  var articleSizeRoot = document.documentElement
  var articleSizeDark = articleSizeRoot.getAttribute('data-theme') === 'dark'
  var articleSizeTextColor = window.getComputedStyle(document.body).color || (articleSizeDark ? '#f5f5f5' : '#333')
  var articleSizeAxisColor = window.getComputedStyle(articleSizeRoot).getPropertyValue('--grey-4').trim() || articleSizeTextColor
  var articleSizeSplitColor = articleSizeDark ? 'rgba(255,220,212,.085)' : 'rgba(148,104,93,.1)'
  var articleSizeSelectedCategories = null
  var articleSizeYAxisFrame = null
  var articleSizeTimeValues = articleSizeData.map(function (item) { return new Date(item.value[0]).getTime() }).filter(Number.isFinite)
  var articleSizeTimeMin = articleSizeTimeValues.length ? Math.min.apply(null, articleSizeTimeValues) : 0
  var articleSizeTimeMax = articleSizeTimeValues.length ? Math.max.apply(null, articleSizeTimeValues) : articleSizeTimeMin

  function articleSizeNiceAxisMax (value) {
    var maximum = Math.max(0, Number(value) || 0)
    if (!maximum) return 100
    var padded = maximum * 1.12
    var magnitude = Math.pow(10, Math.floor(Math.log(padded) / Math.LN10))
    var normalized = padded / magnitude
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
    for (var index = 0; index < steps.length; index++) {
      if (normalized <= steps[index]) return Math.ceil(steps[index] * magnitude)
    }
    return Math.ceil(10 * magnitude)
  }

  function articleSizeVisibleAxisMax () {
    var zoom = (articleSizeChart.getOption().dataZoom || [])[0] || {}
    var start = articleSizeTimeMin + (articleSizeTimeMax - articleSizeTimeMin) * (Number(zoom.start) || 0) / 100
    var end = articleSizeTimeMin + (articleSizeTimeMax - articleSizeTimeMin) * (Number(zoom.end) || 100) / 100
    var maximum = articleSizeData.reduce(function (value, item) {
      var time = new Date(item.value[0]).getTime()
      var selected = !articleSizeSelectedCategories || articleSizeSelectedCategories[item.value[3]] !== false
      return selected && time >= start && time <= end ? Math.max(value, Number(item.value[1]) || 0) : value
    }, 0)
    return articleSizeNiceAxisMax(maximum)
  }

  function updateArticleSizeYAxis () {
    articleSizeYAxisFrame = null
    if (!articleSizeChart || articleSizeChart.isDisposed()) return
    articleSizeChart.setOption({ yAxis: { max: articleSizeVisibleAxisMax() } })
  }

  function scheduleArticleSizeYAxisUpdate () {
    if (articleSizeYAxisFrame !== null) window.cancelAnimationFrame(articleSizeYAxisFrame)
    articleSizeYAxisFrame = window.requestAnimationFrame(updateArticleSizeYAxis)
  }

  articleSizeChart.setOption({
    animationDuration: 900,
    animationEasing: 'cubicOut',
    textStyle: { color: articleSizeTextColor },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(36, 31, 48, .95)',
      borderWidth: 0,
      padding: [10, 13],
      textStyle: { color: '#fff' },
      formatter: function (params) {
        var value = params.value
        return '<strong style="color:#ffd1c9">' + value[2] + '</strong><br>' +
          '<span style="color:#c9c2d4">' + value[0] + ' · ' + value[3] + '</span><br>' +
          '<span style="color:#d9d2e3">文章体量：</span><strong style="color:#ffad9f">' + Number(value[1]).toLocaleString() + '</strong> 字'
      }
    },
    legend: {
      type: 'scroll',
      left: 24,
      right: 18,
      top: 10,
      icon: 'circle',
      itemWidth: 7,
      itemHeight: 7,
      itemGap: 12,
      textStyle: { color: articleSizeTextColor, fontSize: 9 },
      data: articleSizeCategories.map(function (item) { return item.name })
    },
    grid: { top: 54, left: 58, right: 25, bottom: 72 },
    xAxis: {
      type: 'time',
      axisTick: { show: false },
      axisLine: { lineStyle: { color: articleSizeAxisColor } },
      axisLabel: { color: articleSizeTextColor, margin: 12, hideOverlap: true },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '文章字数',
      nameGap: 16,
      nameTextStyle: { color: articleSizeTextColor, fontSize: 10 },
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: articleSizeTextColor,
        formatter: function (value) { return value >= 1000 ? (value / 1000).toFixed(value >= 10000 ? 0 : 1) + 'k' : value }
      },
      splitLine: { show: true, lineStyle: { color: articleSizeSplitColor, type: 'dashed' } }
    },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }, {
      type: 'slider',
      xAxisIndex: 0,
      filterMode: 'none',
      height: 18,
      bottom: 16,
      borderColor: 'transparent',
      backgroundColor: articleSizeDark ? 'rgba(255,255,255,.045)' : 'rgba(148,104,93,.055)',
      fillerColor: 'rgba(233, 84, 107, .16)',
      handleStyle: { color: '#e9546b', borderColor: '#f3b0a8' },
      moveHandleStyle: { color: 'rgba(233, 84, 107, .34)' },
      textStyle: { color: articleSizeTextColor }
    }],
    series: articleSizeCategories.map(function (category) {
      return {
        name: category.name,
        type: 'scatter',
        data: articleSizeData.filter(function (item) { return item.value[3] === category.name }),
        symbolSize: function (value) { return Math.max(8, Math.min(27, 6 + Math.sqrt(Math.max(0, value[1])) / 5.5)) },
        itemStyle: { color: category.color, opacity: .78, borderColor: articleSizeDark ? 'rgba(255,255,255,.72)' : '#fff', borderWidth: 1.5, shadowBlur: 8, shadowColor: category.color },
        emphasis: {
          focus: 'series',
          scale: 1.35,
          label: { show: true, position: 'top', color: articleSizeTextColor, fontSize: 10, formatter: function (params) { return params.value[2].length > 13 ? params.value[2].slice(0, 13) + '…' : params.value[2] } },
          itemStyle: { opacity: 1, shadowBlur: 16 }
        }
      }
    })
  })
  updateArticleSizeYAxis()
  articleSizeChart.on('datazoom', scheduleArticleSizeYAxisUpdate)
  articleSizeChart.on('legendselectchanged', function (event) {
    articleSizeSelectedCategories = event.selected || null
    scheduleArticleSizeYAxisUpdate()
  })
  articleSizeChart.on('click', 'series', function (event) {
    if (!event.value || !event.value[4]) return
    var root = String(articleSizeRootPath || '/')
    var path = String(event.value[4])
    if (root.charAt(root.length - 1) !== '/') root += '/'
    while (path.charAt(0) === '/') path = path.slice(1)
    window.location.href = root + path
  })
  window.ShokaStatisticsCharts.register(articleSizeChart, function () {
    articleSizeChart.resize()
    scheduleArticleSizeYAxisUpdate()
  })
  </script>`
}

function tagsChart (length) {
  const tags = []
  hexo.locals.get('tags').forEach(function (tag) {
    tags.push({ name: String(tag.name), value: Number(tag.length) || 0 })
  })
  tags.sort(function (a, b) { return b.value - a.value })
  const dataLength = Math.min(tags.length, Math.max(1, Number(length) || tags.length))
  const selected = tags.slice(0, dataLength)

  return `
  <script type="text/x-shoka-statistics" id="tagsChart">
  var tagsChart = echarts.init(document.getElementById('tags-chart'), 'light')
  var tagsChartNames = ${jsonForScript(selected.map(function (tag) { return tag.name }))}
  var tagsChartValues = ${jsonForScript(selected.map(function (tag) { return tag.value }))}
  var tagsChartRootPath = ${jsonForScript(hexo.config.root || '/')}
  var tagsChartRoot = document.documentElement
  var tagsChartDark = tagsChartRoot.getAttribute('data-theme') === 'dark'
  var tagsChartTextColor = window.getComputedStyle(document.body).color || (tagsChartDark ? '#f5f5f5' : '#333')
  var tagsChartSplitColor = tagsChartDark ? 'rgba(255,220,212,.085)' : 'rgba(148,104,93,.1)'
  var tagsChartTrackColor = tagsChartDark ? 'rgba(255,255,255,.045)' : 'rgba(148,104,93,.05)'
  tagsChart.setOption({
    animationDuration: 850,
    animationEasing: 'cubicOut',
    textStyle: { color: tagsChartTextColor },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(233, 84, 107, .055)' } },
      backgroundColor: 'rgba(36, 31, 48, .94)',
      borderWidth: 0,
      padding: [8, 11],
      textStyle: { color: '#fff' },
      formatter: function (params) { return '<span style="color:#ead0cc">' + params[0].name + '</span>　<strong style="color:#ffb5aa">' + params[0].value + '</strong> 篇' }
    },
    grid: { top: 22, left: 112, right: 42, bottom: 24 },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: tagsChartTextColor },
      splitLine: { show: true, lineStyle: { color: tagsChartSplitColor, type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: tagsChartTextColor,
        margin: 12,
        formatter: function (value, index) { return '{rank|' + String(index + 1).padStart(2, '0') + '}  {name|' + value + '}' },
        rich: { rank: { color: '#e9546b', fontSize: 10, fontWeight: 600 }, name: { color: tagsChartTextColor, fontSize: 11 } }
      },
      data: tagsChartNames
    },
    series: [{
      name: '文章篇数',
      type: 'bar',
      data: tagsChartValues,
      barWidth: 14,
      barMaxWidth: 16,
      showBackground: true,
      backgroundStyle: { color: tagsChartTrackColor, borderRadius: 8 },
      label: { show: true, position: 'right', distance: 7, color: tagsChartTextColor, fontSize: 10, formatter: '{c}' },
      itemStyle: {
        borderRadius: [0, 8, 8, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#ecaa72' }, { offset: .52, color: '#ec8c69' }, { offset: 1, color: '#e9546b' }])
      },
      emphasis: { focus: 'series', itemStyle: { shadowBlur: 12, shadowColor: 'rgba(233, 84, 107, .3)' } },
      markLine: {
        symbol: ['none', 'none'],
        label: { color: tagsChartTextColor, formatter: '平均 {c}' },
        lineStyle: { color: 'rgba(236, 140, 105, .42)', type: 'dashed' },
        data: [{ name: '平均值', type: 'average' }]
      }
    }]
  })
  tagsChart.on('click', 'series', function (event) {
    var root = String(tagsChartRootPath || '/')
    if (root.charAt(root.length - 1) !== '/') root += '/'
    window.location.href = root + 'tags/' + encodeURIComponent(event.name) + '/'
  })
  window.ShokaStatisticsCharts.register(tagsChart, function () { tagsChart.resize() })
  </script>`
}

function categoriesChart () {
  const categoryMap = new Map()
  hexo.locals.get('posts').forEach(function (post) {
    leafCategoryItems(post.categories).forEach(function (category) {
      const path = categoryPath(category)
      const key = path || String(category.name)
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { name: String(category.name), value: 0, path: path })
      }
      categoryMap.get(key).value += 1
    })
  })
  const categories = Array.from(categoryMap.values())
  categories.sort(function (a, b) { return b.value - a.value })
  const total = categories.reduce(function (sum, category) { return sum + category.value }, 0)

  return `
  <script type="text/x-shoka-statistics" id="categoriesChart">
  var categoriesChart = echarts.init(document.getElementById('categories-chart'), 'light')
  var categoriesChartData = ${jsonForScript(categories)}
  var categoriesChartRootPath = ${jsonForScript(hexo.config.root || '/')}
  var categoriesChartRoot = document.documentElement
  var categoriesChartDark = categoriesChartRoot.getAttribute('data-theme') === 'dark'
  var categoriesChartTextColor = window.getComputedStyle(document.body).color || (categoriesChartDark ? '#f5f5f5' : '#333')
  categoriesChart.setOption({
    animationDuration: 900,
    animationEasing: 'cubicOut',
    color: ['#e9546b', '#ec8c69', '#dfa56c', '#d97893', '#c98672', '#ed7ead', '#b97970', '#e7b07c'],
    textStyle: { color: categoriesChartTextColor },
    title: {
      text: ${jsonForScript(String(total))},
      subtext: '已分类文章',
      left: 'center',
      top: '34%',
      textStyle: { color: categoriesChartTextColor, fontSize: 24, fontWeight: 600 },
      subtextStyle: { color: categoriesChartTextColor, fontSize: 10, lineHeight: 18, opacity: .65 }
    },
    legend: { type: 'scroll', left: 'center', right: 12, bottom: 5, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 13, textStyle: { color: categoriesChartTextColor, fontSize: 10 } },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(36, 31, 48, .94)',
      borderWidth: 0,
      padding: [9, 12],
      textStyle: { color: '#fff' },
      formatter: function (params) {
        return '<span style="display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;background:' + params.color + '"></span>' +
          '<span style="color:#ead0cc">' + params.name + '</span><br><strong style="color:#ffb5aa">' + params.value + '</strong> 篇　' + params.percent + '%'
      }
    },
    series: [{
      name: '文章篇数',
      type: 'pie',
      radius: ['32%', '62%'],
      center: ['50%', '43%'],
      avoidLabelOverlap: true,
      minAngle: 4,
      padAngle: 2,
      label: { color: categoriesChartTextColor, fontSize: 10, lineHeight: 15, formatter: function (params) { return params.name + '\\n' + params.value + ' 篇' } },
      labelLine: { length: 12, length2: 8, lineStyle: { color: 'rgba(236, 140, 105, .38)' } },
      data: categoriesChartData,
      itemStyle: { borderWidth: 0, borderRadius: 6 },
      emphasis: { scaleSize: 8, itemStyle: { shadowBlur: 16, shadowOffsetX: 0, shadowColor: 'rgba(233, 84, 107, .28)' }, label: { fontWeight: 600 } }
    }]
  })
  categoriesChart.on('click', 'series', function (event) {
    if (!event.data || !event.data.path) return
    var root = String(categoriesChartRootPath || '/')
    if (root.charAt(root.length - 1) !== '/') root += '/'
    window.location.href = root + String(event.data.path).replace(/^\\/+/, '')
  })
  window.ShokaStatisticsCharts.register(categoriesChart, function () { categoriesChart.resize() })
  </script>`
}

function categoryTagSunburstChart () {
  const relationMap = new Map()
  hexo.locals.get('posts').forEach(function (post) {
    const categories = leafCategoryItems(post.categories)
    const tags = collectionNames(post.tags)
    const postCategories = categories.length ? categories : [{ name: '未分类', path: '' }]
    const postTags = tags.length ? tags : ['无标签']
    postCategories.forEach(function (category) {
      const categoryName = String(category.name)
      const path = category.path ? categoryPath(category) : ''
      const key = path || categoryName
      if (!relationMap.has(key)) {
        relationMap.set(key, { name: categoryName, path: path, tags: new Map() })
      }
      const tagMap = relationMap.get(key).tags
      postTags.forEach(function (tag) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1)
      })
    })
  })

  const data = Array.from(relationMap, function (categoryEntry) {
    const category = categoryEntry[1]
    const children = Array.from(category.tags, function (tagEntry) {
      return { name: tagEntry[0], value: tagEntry[1], linkType: tagEntry[0] === '无标签' ? '' : 'tag' }
    }).sort(function (a, b) { return b.value - a.value })
    return {
      name: category.name,
      value: children.reduce(function (sum, child) { return sum + child.value }, 0),
      linkType: category.path ? 'category' : '',
      path: category.path,
      children: children
    }
  }).sort(function (a, b) { return b.value - a.value })

  return `
  <script type="text/x-shoka-statistics" id="categoryTagSunburstChart">
  var categoryTagSunburstChart = echarts.init(document.getElementById('category-tag-sunburst'), 'light')
  var categoryTagSunburstData = ${jsonForScript(data)}
  var categoryTagSunburstRootPath = ${jsonForScript(hexo.config.root || '/')}
  var categoryTagSunburstRoot = document.documentElement
  var categoryTagSunburstDark = categoryTagSunburstRoot.getAttribute('data-theme') === 'dark'
  var categoryTagSunburstTextColor = window.getComputedStyle(document.body).color || (categoryTagSunburstDark ? '#f5f5f5' : '#333')
  var categoryTagSunburstGapColor = categoryTagSunburstDark ? '#252733' : '#fff'
  categoryTagSunburstChart.setOption({
    animationDuration: 1050,
    animationEasing: 'cubicOut',
    color: ['#e9546b', '#ec8c69', '#dfa56c', '#d97893', '#c98672', '#ed7ead', '#b97970', '#e7b07c'],
    textStyle: { color: categoryTagSunburstTextColor },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(36, 31, 48, .95)',
      borderWidth: 0,
      padding: [9, 12],
      textStyle: { color: '#fff' },
      formatter: function (params) {
        var path = (params.treePathInfo || []).slice(1).map(function (item) { return item.name }).join(' / ')
        return '<span style="color:#ead0cc">' + path + '</span><br><strong style="color:#ffb5aa">' + params.value + '</strong> 次内容关联'
      }
    },
    series: [{
      name: '分类与标签',
      type: 'sunburst',
      data: categoryTagSunburstData,
      radius: ['18%', '90%'],
      center: ['50%', '50%'],
      sort: 'desc',
      nodeClick: false,
      minAngle: 3,
      emphasis: { focus: 'ancestor' },
      itemStyle: { borderColor: categoryTagSunburstGapColor, borderWidth: 2, borderRadius: 5 },
      label: { color: '#fff', textBorderColor: 'rgba(38, 27, 52, .72)', textBorderWidth: 2 },
      levels: [{}, {
        r0: '18%',
        r: '52%',
        label: { rotate: 'tangential', fontSize: 11, fontWeight: 600, color: '#fff', padding: [2, 3], textBorderColor: 'rgba(38,27,52,.6)', textBorderWidth: 2, formatter: function (params) { return params.value > 1 ? params.name : '' } },
        itemStyle: { borderColor: categoryTagSunburstGapColor, borderWidth: 3, borderRadius: 6 }
      }, {
        r0: '54%',
        r: '90%',
        label: { rotate: 'radial', fontSize: 10, fontWeight: 600, color: '#fff', padding: [1, 2], textBorderColor: 'rgba(38,27,52,.78)', textBorderWidth: 2, textShadowColor: 'rgba(20,14,30,.45)', textShadowBlur: 3, formatter: function (params) { return params.value > 2 ? params.name : '' } },
        itemStyle: { borderColor: categoryTagSunburstGapColor, borderWidth: 2, borderRadius: 6, opacity: .9 }
      }]
    }],
    graphic: [{
      type: 'group',
      left: 'center',
      top: 'middle',
      silent: true,
      children: [{ type: 'text', style: { text: '分类', fill: categoryTagSunburstDark ? '#f0d7d2' : '#6d4b45', font: '600 13px sans-serif', textAlign: 'center' } },
        { type: 'text', top: 17, style: { text: '标签', fill: categoryTagSunburstDark ? '#f0d7d2' : '#6d4b45', opacity: .62, font: '9px sans-serif', textAlign: 'center' } }]
    }]
  })
  categoryTagSunburstChart.on('click', 'series', function (event) {
    if (!event.data || !event.data.linkType) return
    var root = String(categoryTagSunburstRootPath || '/')
    if (root.charAt(root.length - 1) !== '/') root += '/'
    if (event.data.linkType === 'category') {
      window.location.href = root + String(event.data.path).replace(/^\\/+/, '')
      return
    }
    window.location.href = root + 'tags/' + encodeURIComponent(event.name) + '/'
  })
  window.ShokaStatisticsCharts.register(categoryTagSunburstChart, function () { categoryTagSunburstChart.resize() })
  </script>`
}
