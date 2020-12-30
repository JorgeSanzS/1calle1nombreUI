import { geoMercator, geoPath } from "d3-geo"
import { select } from "d3-selection"
import { interval } from "d3-timer"
import { transition } from "d3-transition"
import { scaleQuantile, scalePoint } from "d3-scale"
import { drag } from "d3-drag"
import { schemeGreens } from "d3-scale-chromatic"
import { zoom, zoomIdentity } from "d3-zoom"
import { feature } from "topojson-client"
import { percent, formatDate, get } from "./helpers"
import { ELEMENTS, TOPOJSON_PROP, TOPOJSON_URL, FEATURE_ID, FEATURE_VALUES, FEATURE_DESC } from "./elements"

// constants
const INTERVAL_TIME = 1000
const projection = geoMercator()
const range = schemeGreens[9]
const color = scaleQuantile(range).domain([0, 1])
const mmm = scalePoint()
const z = zoom().scaleExtent([1, 8])
const getId = get("properties", FEATURE_ID)
const getValues = get("properties", FEATURE_VALUES)
const getDesc = get("properties", FEATURE_DESC)

// variables
let currentMonthIx = 0
let currentFeatureIx = 0
let geojson = null
let months = null
let w = 0
let h = 0
let tick = null

// static elements
const map = select("#map")
const svg = map.append("svg")
const gpath = svg.append("g")
const gmonth = svg.append("g")
const slider = svg.append("g").style("opacity", 0)
const tooltip = map.append("div").attr("class", "tooltip card")

const loader = map
  .append("div")
  .attr("class", "loader__container")
  .append("div")
  .attr("class", "loader")

const sidebar = map.append("div").attr("class", "sidebar")

const legendRanges = sidebar
  .append("div")
  .attr("class", "legend card")
  .selectAll(".legend__range")
  .data(range)
  .join("div")
  .attr("class", "legend__range")

legendRanges
  .append("i")
  .attr("class", "legend__range-square")
  .style("background-color", d => d)

legendRanges.append("span").text((d) => {
  const [start, end] = color.invertExtent(d)
  return `${percent(start)} - ${percent(end)}`
})

sidebar
  .append("div")
  .attr("class", "controls card")
  .selectAll("button")
  .data(["stop", "play"])
  .join("button")
  .attr("id", d => d)
  .attr("class", "control__button")
  .on("click", ({ target }) => {
    select("#play").classed("pause", false)
    
    if (target.id === "play") {
      if (tick !== null) {
        tick.stop()
        tick = null
        return
      }

      select(target).classed("pause", true)
      if (currentMonthIx === months.length - 1) currentMonthIx = 0
      tick = interval(() => {
        currentMonthIx++
        render()
        if (currentMonthIx === months.length - 1) tick.stop()
      }, INTERVAL_TIME)
    } else if (target.id === "stop") {
      currentMonthIx = 0
      if (tick !== null) {
        tick.stop()
        tick = null
      }
      render()
    }
  })
  .append("span")
  .attr("class", d => `control__button-${d}`)

sidebar
  .append("div")
  .attr("class", "selector card")
  .append("select")
  .on("change", ({ target: { value } }) => {
    const ix = ELEMENTS.findIndex(x => x.code === value)
    currentFeatureIx = ix < 0 ? 0 : ix
    render()
  })
  .selectAll("option")
  .data(ELEMENTS)
  .join("option")
  .attr("value", ({ code }) => code)
  .attr(
    "selected",
    ({ code }) => code === ELEMENTS[currentFeatureIx].code || null
  )
  .text(x => x.value)
  
const lineSlider = slider
  .append("line")
  .attr("x1", 0)
  .attr("stroke", "white")
  .attr("stroke-width", 15)
  .attr("stroke-linecap", "round")
  
const ghostLineSlider = slider
  .append("line")
  .attr("x1", 0)
  .attr("stroke", "transparent")
  .attr("stroke-width", 300)
  .attr("stroke-linecap", "round")
  .style("cursor", "crosshair")
  .call(drag()
    .on("start.interrupt", () => slider.interrupt())
    .on("start drag", ({ x }) => {
      const [min, max] = mmm.range()
      const ix = Math.floor(x / mmm.step())

      circle.attr("cx", x)

      if (ix !== currentMonthIx) {
        currentMonthIx = ix
        render()
      }
  }))
  
const circle = slider
  .append("circle")
  .attr("r", 15)
  .attr("fill", "#fafafa")
  .attr("stroke", "#310234")

// map functions
const render = () => {
  const t = svg.transition().duration(INTERVAL_TIME * 0.9)

  gmonth
    .selectAll("text")
    .data(months.filter((_, ix) => currentMonthIx === ix), x => x)
    .join(
      enter => enter
        .append("text")
        .attr("x", w * 2)
        .attr("y", w < 640 ? h * 0.8 : h * 0.9)
        .attr("dy", "-1em")
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "hanging")
        .attr("fill", "white")
        .attr("font-size", "2em")
        .text(d => `${formatDate(new Date(d), { month: "long" })} '${formatDate(new Date(d), { year: "2-digit" })}`)
        .call(enter => enter.transition(t).attr("x", w * 0.95)),
      update => update,
      exit => exit.call(exit => exit.transition(t).style("opacity", 0).attr("x", w * 0.5).remove())
    )

  const isFeatureActive = d => {
    const { code } = ELEMENTS[currentFeatureIx]
    if (!code) return true
    return code === getId(d).substring(0, 2)
  }

  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds({
    ...geojson,
    features: geojson.features.filter(isFeatureActive),
  })

  z.on("zoom", ({ transform }) => gpath.attr("transform", transform))
  svg.call(z)

  svg
    .transition(t)
    .call(
      z.transform,
      zoomIdentity
        .translate(w / 2, h / 2)
        .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / w, (y1 - y0) / h)))
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
    )

  gpath
    .selectAll("path")
    .data(geojson.features.map(d => ({ ...d, activated: isFeatureActive(d) })), getId)
    .join(
      enter => enter
        .append("path")
        .attr("d", d => geoPath(projection)(d))
        .attr("stroke-alignment", "inner")
        .attr("stroke-width", 0.5)
        .attr("fill", d => color(getValues(d)[months[currentMonthIx]]))
        .attr("stroke-opacity", 1)
        .attr("stroke", d => color(getValues(d)[months[currentMonthIx]]))
        .style("pointer-events", "auto")
        .on("mouseenter", ({ pageX, pageY, target }, d) => {
          const t = svg.transition().duration(INTERVAL_TIME / 4)
          select(target)
            .raise()
            .attr("stroke-width", 2)
            .transition(t)
            .attr("fill", "#7d0633")
            .attr("stroke", "#310234")
            
          tooltip
            .style("opacity", 1)
            .style("top", `${pageY}px`)
            .style("left", `${pageX}px`)
            .html(
              `${getDesc(d)}: <em>${percent(getValues(d)[months[currentMonthIx]])}</em>`
            )
        })
        .on("mouseleave", ({ target }) => {
          const t = svg.transition().duration(INTERVAL_TIME / 4)
          select(target)
            .attr("stroke-width", 0.5)
            .transition(t)
            .attr("fill", d => color(getValues(d)[months[currentMonthIx]]))
            .attr("stroke", d => color(getValues(d)[months[currentMonthIx]]))

          tooltip.style("opacity", 0)
        }),
      update => {
        // reduce the number of transitions
        update.filter(({ activated }) => !activated)
          .attr("fill", "black")
          .attr("stroke-opacity", 0.25)
          .attr("stroke", "#fafafa")
          .style("pointer-events", "none")
        return update
          .filter(({ activated }) => !!activated)
          .call(update => update.transition(t)
            .attr("fill", d => color(getValues(d)[months[currentMonthIx]]))
            .attr("stroke-opacity", 1)
            .attr("stroke", d => color(getValues(d)[months[currentMonthIx]]))
            .style("pointer-events", "auto"))
      },
      exit => exit.remove()
    )
}

const resize = () => {
  ({ width: w, height: h } = map.node().getBoundingClientRect())
  svg.attr("viewBox", [0, 0, w, h])
  projection.fitSize([w, h], geojson)
  
  const [from, to] = [w < 640 ? w * 0.05 : w * 0.6, w * 0.95]
  mmm.range([from, to])
  lineSlider.attr("x2", to - from)
  ghostLineSlider.attr("x2", to - from)
  slider.attr("transform", `translate(${from} ${w < 640 ? h * 0.85 : h * 0.95})`).style("opacity", 1)
    
  render()
}

const reload = async (...promises) => {
  const [topojson] = await Promise.all(promises)
  geojson = feature(
    topojson,
    topojson.objects[TOPOJSON_PROP]
  )

  // set the differents month-year tuples
  months = [
    ...new Set(
      geojson.features
        .map(({ properties: { values } }) => Object.keys(values))
        .flat()
    ),
  ]

  mmm.domain(months)

  // fit & render map
  resize()

  // hide spinner
  loader.style("opacity", 0)
}

// init app
reload(fetch(TOPOJSON_URL).then((r) => r.json()))

addEventListener("resize", resize)
