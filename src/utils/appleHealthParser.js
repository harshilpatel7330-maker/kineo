import { Unzip, UnzipInflate } from 'fflate'

// Attribute regex — captures key="value" or key='value'
const ATTR_RE = /(\w+)=(?:"([^"]*)"|'([^']*)')/g

function parseAttrs(tag) {
  const attrs = {}
  ATTR_RE.lastIndex = 0
  let m
  while ((m = ATTR_RE.exec(tag)) !== null) {
    attrs[m[1]] = m[2] ?? m[3]
  }
  return attrs
}

// Parse "2024-01-15 07:00:00 -0800" → Date
function parseAppleDate(str) {
  if (!str) return null
  const m = str.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/)
  if (!m) return null
  return new Date(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`)
}

function toDateStr(d) {
  if (!d || isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WORKOUT_TYPE_MAP = {
  HKWorkoutActivityTypeRunning:                    'run',
  HKWorkoutActivityTypeCycling:                    'bike',
  HKWorkoutActivityTypeSwimming:                   'swim',
  HKWorkoutActivityTypeWalking:                    'walk',
  HKWorkoutActivityTypeTraditionalStrengthTraining:'strength',
  HKWorkoutActivityTypeFunctionalStrengthTraining: 'strength',
  HKWorkoutActivityTypeHighIntensityIntervalTraining:'strength',
  HKWorkoutActivityTypeCrossTraining:              'other',
}

const DEFAULT_RPE = {
  run: 6, bike: 5, swim: 6, walk: 4, strength: 7, other: 6,
}

const SLEEP_STAGES = new Set([
  'HKCategoryValueSleepAnalysisAsleepCore',
  'HKCategoryValueSleepAnalysisAsleepREM',
  'HKCategoryValueSleepAnalysisAsleepDeep',
])

// Streaming XML tokenizer for Apple Health export.xml.
// Only processes <Record> and <Workout> elements; skips everything else.
class AppleHealthXmlParser {
  constructor() {
    this.decoder = new TextDecoder('utf-8', { fatal: false })
    this.buffer = ''
    this._hrv      = {}   // date → [values]
    this._rhr      = {}   // date → [values]
    this._sleep    = {}   // date → total hours
    this._respRate = {}   // date → [values]
    this._workouts = []
  }

  push(uint8Array, final) {
    this.buffer += this.decoder.decode(uint8Array, { stream: !final })
    this._process(final)
  }

  _process(final) {
    let pos = 0

    while (pos < this.buffer.length) {
      const tagStart = this.buffer.indexOf('<', pos)
      if (tagStart === -1) {
        // No '<' remaining — trim consumed text
        this.buffer = final ? '' : (this.buffer.length > 2048 ? this.buffer.slice(-2048) : this.buffer)
        return
      }

      // Skip closing tags, PIs, DOCTYPE, comments
      const next = this.buffer[tagStart + 1]
      if (next === '/' || next === '?' || next === '!') {
        const end = this.buffer.indexOf('>', tagStart)
        if (end === -1) { this.buffer = this.buffer.slice(tagStart); return }
        pos = end + 1
        continue
      }

      // Find tag end, respecting quoted strings
      const tagEnd = this._findTagEnd(tagStart)
      if (tagEnd === -1) {
        // Incomplete tag — keep from tagStart
        this.buffer = this.buffer.slice(tagStart)
        return
      }

      const tag = this.buffer.slice(tagStart, tagEnd + 1)
      this._handleTag(tag)
      pos = tagEnd + 1
    }

    this.buffer = final ? '' : ''
  }

  _findTagEnd(start) {
    let i = start + 1
    let inQuote = false
    let qc = ''
    while (i < this.buffer.length) {
      const c = this.buffer[i]
      if (inQuote) {
        if (c === qc) inQuote = false
      } else if (c === '"' || c === "'") {
        inQuote = true; qc = c
      } else if (c === '>') {
        return i
      }
      i++
    }
    return -1
  }

  _handleTag(tag) {
    const nameEnd = tag.search(/[\s/>]/)
    if (nameEnd <= 1) return
    const name = tag.slice(1, nameEnd)
    if (name !== 'Record' && name !== 'Workout') return

    const attrs = parseAttrs(tag)

    if (name === 'Record') {
      this._handleRecord(attrs)
    } else {
      this._handleWorkout(attrs)
    }
  }

  _handleRecord(attrs) {
    const type = attrs.type
    if (!type) return

    if (type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
      const date = toDateStr(parseAppleDate(attrs.startDate))
      const v = parseFloat(attrs.value)
      if (date && !isNaN(v)) {
        ;(this._hrv[date] = this._hrv[date] ?? []).push(v)
      }
      return
    }

    if (type === 'HKQuantityTypeIdentifierRestingHeartRate') {
      const date = toDateStr(parseAppleDate(attrs.startDate))
      const v = parseFloat(attrs.value)
      if (date && !isNaN(v)) {
        ;(this._rhr[date] = this._rhr[date] ?? []).push(v)
      }
      return
    }

    if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      if (!SLEEP_STAGES.has(attrs.value)) return
      const start = parseAppleDate(attrs.startDate)
      const end   = parseAppleDate(attrs.endDate)
      if (!start || !end) return
      // Attribute to morning date: startDate + 12 hours
      const morningDate = toDateStr(new Date(start.getTime() + 12 * 3600000))
      const hrs = (end - start) / 3600000
      if (morningDate && hrs > 0) {
        this._sleep[morningDate] = (this._sleep[morningDate] ?? 0) + hrs
      }
      return
    }

    if (type === 'HKQuantityTypeIdentifierRespiratoryRate') {
      const start = parseAppleDate(attrs.startDate)
      if (!start) return
      const hour = start.getHours()
      // Keep only night-time readings (10pm – 8am)
      if (hour >= 8 && hour < 22) return
      const date = toDateStr(start)
      const v = parseFloat(attrs.value)
      if (date && !isNaN(v)) {
        ;(this._respRate[date] = this._respRate[date] ?? []).push(v)
      }
    }
  }

  _handleWorkout(attrs) {
    const actType = attrs.workoutActivityType ?? ''
    const workoutType = WORKOUT_TYPE_MAP[actType] ?? 'other'
    const start = parseAppleDate(attrs.startDate)
    if (!start) return
    const date = toDateStr(start)
    const durationMin = Math.round(parseFloat(attrs.duration ?? '0'))
    if (date && durationMin > 0) {
      this._workouts.push({
        date,
        workout_type: workoutType,
        duration_min: durationMin,
        rpe: DEFAULT_RPE[workoutType] ?? 6,
        intensity_label: 'moderate',
        source: 'apple_health',
      })
    }
  }

  getResults() {
    const avg = (arr) => Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10

    const hrv = {}
    for (const [d, vs] of Object.entries(this._hrv)) hrv[d] = avg(vs)

    const rhr = {}
    for (const [d, vs] of Object.entries(this._rhr)) rhr[d] = Math.round(avg(vs))

    const sleep = {}
    for (const [d, h] of Object.entries(this._sleep)) sleep[d] = Math.round(h * 10) / 10

    const respRate = {}
    for (const [d, vs] of Object.entries(this._respRate)) respRate[d] = avg(vs)

    return { hrv, rhr, sleep, respRate, workouts: this._workouts }
  }
}

// Main entry point.
// Returns a Promise that resolves to { hrv, rhr, sleep, respRate, workouts }.
// onProgress({ phase: 'parsing'|'done', pct: 0-100 }) is called periodically.
export function parseAppleHealthZip(file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const parser = new AppleHealthXmlParser()
    const unzip  = new Unzip()
    unzip.register(UnzipInflate)

    let foundXml       = false
    let xmlBytesIn     = 0    // compressed bytes consumed by the xml entry
    const fileSize     = file.size

    unzip.onfile = (entry) => {
      // Apple Health: apple_health_export/export.xml
      if (!entry.name.endsWith('export.xml')) return
      foundXml = true

      entry.ondata = (err, data, final) => {
        if (err) { reject(err); return }
        parser.push(data, final)
        if (final) resolve(parser.getResults())
      }
      entry.start()
    }

    const reader = file.stream().getReader()
    let bytesRead = 0

    function pump() {
      reader.read().then(({ done, value }) => {
        if (done) {
          try { unzip.push(new Uint8Array(0), true) } catch (_) {}
          if (!foundXml) reject(new Error('export.xml not found in ZIP — make sure you selected an Apple Health export ZIP'))
          return
        }
        bytesRead += value.length
        if (onProgress) onProgress({ phase: 'parsing', pct: Math.min(95, Math.round((bytesRead / fileSize) * 100)) })
        try { unzip.push(value) } catch (e) { reject(e); return }
        pump()
      }).catch(reject)
    }

    pump()
  })
}
