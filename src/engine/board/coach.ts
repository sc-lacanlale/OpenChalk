// What the model is told after every tool call: a text list of the board (it cannot see it) and one line of coaching.
// These strings steer how the lessons feel, so change them with a live lesson open.
import { bandItems, stackRows, type Board } from './state'

export function boardLines(b: Board): string[] {
  const out: string[] = []
  if (b.title) out.push('title: ' + b.title + (b.subtitle ? ' | ' + b.subtitle : '') + ' [' + b.layout + ' layout]')
  if (b.figure) out.push('figure: ' + b.figure.shape + (b.figure.label ? ' "' + b.figure.label + '"' : ''))
  b.parts.forEach((p, id) => {
    const co = b.callouts.get(id)
    out.push((p.photo ? 'photo ' : 'part ') + id + ' (' + p.name + ') at ' + (p.slot || 'custom') + (co ? ', label "' + co.heading + '"' : ', no label'))
  })
  b.links.forEach((k) => out.push('link ' + k.from + ' -> ' + k.to))
  b.writes.forEach((w, id) => out.push((w.band ? w.style : 'line') + ' ' + id + ': ' + w.text))
  b.nodes.forEach((n, id) => out.push('node ' + id + ': ' + n.label))
  if (b.chart) out.push('chart: ' + b.chart.desc)
  return out.length ? out : ['empty']
}

export function hint(b: Board): string {
  if (!b.started) return 'Call new_board to start the lesson.'
  if (b.kind === 'chart') return 'The chart is up. Explain what it shows, then write one takeaway and keep presenting.'
  if (b.kind === 'flow') return 'Add the next step with add_node and add_arrow, and keep talking.'
  const n = b.parts.size
  const rows = stackRows(b)
  const band = bandItems(b)
  const has = (s: string) => band.some(([, w]) => w.style === s)
  if (has('takeaway') && has('question')) return 'The lesson is wrapped up. Finish your sentence, then ask what they want to explore next.'
  if (has('question')) return 'Your question is on the board. If they answer, react to it; if not, carry on with the next idea.'
  if (b.layout === 'split') {
    if (rows === 0 && n === 0) return 'Write the first keypoint now (3 to 8 words) as you start speaking, then draw its picture.'
    if (rows < n + 1) {
      return 'The board has fewer keypoints than the talk needs. write() the next fact you are about to say as a short keypoint (3 to 8 words), every date, name and number included.'
    }
    if (rows > n + 3) return 'Plenty of text so far. Show the next idea with a picture (part).'
    if (n >= 3 && rows >= 5 && !has('takeaway')) return 'Wrap up: write the takeaway (style takeaway), then your closing question (style question).'
    return 'Keep going: write each fact as a keypoint just before you say it, and add a picture for each new thing.'
  }
  if (band.length >= 2 && !has('takeaway') && n >= 2) {
    return 'The bottom notes are full. If you have more facts to write, start a split board with new_board (layout split) so keypoints get a column; otherwise wrap up with the takeaway.'
  }
  if (n === 0) return 'Add the first part and explain it out loud as it draws.'
  if (n >= 2 && band.length === 0 && !has('takeaway')) {
    return 'Balance: a teacher draws AND writes. write() one key fact (a definition, number or formula) in note style, then keep going.'
  }
  if (n >= 2 && n <= 3 && b.asked === 0) {
    return 'Keep presenting: draw the next idea. Somewhere in the next two, throw in a quick "what do you think?" and keep going.'
  }
  if (n >= 4 && !has('takeaway')) {
    return 'Link related parts if it helps, then wrap up: write the takeaway (style takeaway) and a closing question (style question).'
  }
  if (!has('question')) return 'Time to wrap up: write the takeaway, then ask your closing question.'
  return 'Keep going with the next idea, or wrap up.'
}

/** idle: nothing taught yet. teaching: a lesson is in progress. done: the takeaway is up, so the app stops nudging the tutor onward. */
export function stageOf(b: Board): 'idle' | 'teaching' | 'done' {
  if (!b.started || (!b.parts.size && !b.writes.size && !b.nodes.size && !b.chart)) return 'idle'
  return b.writes.has('takeaway') ? 'done' : 'teaching'
}
