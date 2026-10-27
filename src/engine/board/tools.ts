// The tools Gemini can call, in the Live API's function-declaration format. The descriptions are prompt text:
// the model reads them to decide what to draw, so word changes here change its behaviour.
import { MOTIF_NAMES } from '../motifs'

const S = (description: string) => ({ type: 'STRING', description })
const tool = (name: string, description: string, properties: Record<string, ReturnType<typeof S>>, required: string[]) => ({
  name,
  description,
  parameters: { type: 'OBJECT', properties, required },
})

export const TOOL_NAMES = [
  'new_board',
  'set_title',
  'part',
  'photo',
  'callout',
  'link',
  'highlight',
  'write',
  'chart',
  'add_node',
  'add_arrow',
  'sketch',
  'erase',
] as const
export type ToolName = (typeof TOOL_NAMES)[number]

const SLOTS_HELP =
  'Diagram slots: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right. Split slots: top-left, top-right, bottom-left, bottom-right. Put the main idea at center first and spread the rest. Omit to let the board pick.'

const declarations: ReturnType<typeof tool>[] = [
  tool(
    'new_board',
    'Start a fresh board for a topic: clears the old one and writes the title. Call it first, and again for each new topic. layout "split" (default) puts keypoints down the left and up to 4 pictures on the right, for nearly every topic; layout "diagram" is one picture with colored labels around it, only for a single object with parts. An optional outline figure (a cell, a cloud) holds the parts on diagram boards.',
    {
      title: S('Short and catchy, max 5 words, e.g. "The cell\'s group chat"'),
      subtitle: S('Optional witty or plain one-liner under the title, max 8 words'),
      layout: S('split (default) or diagram'),
      figure: S('Diagram only. Optional outline the parts sit inside: blob, circle, oval, box, cloud or triangle.'),
      figure_label: S('Optional small caption under the figure, e.g. "animal cell"'),
    },
    ['title'],
  ),
  tool('set_title', 'Rename the current board without clearing it.', { title: S('max 5 words'), subtitle: S('optional') }, ['title']),
  tool(
    'part',
    'Draw ONE picture in a slot and, with a heading, label it in color. This is how you teach: one part per idea, called just before you talk about it. what is the literal real-world noun (lungs, volcano, mitochondria), never a metaphor; the playful name goes in heading. Unknown nouns are looked up in a big icon library; if nothing fits you still get a plain shape plus your label.',
    {
      id: S('short unique id, e.g. nucleus'),
      what: S(
        'What to draw. A motif: ' +
          MOTIF_NAMES.join(', ') +
          '. Or any plain word or Lucide icon name: tree-pine, flower-2, sun, droplets, factory, recycle, wind, zap, atom, brain, heart, bug, thermometer, mountain, house, book-open, rocket, flask-conical, lightbulb. Words are searched, so "plant" or "pollution" work.',
      ),
      at: S(SLOTS_HELP),
      heading: S('The label: 1 to 3 words, e.g. Nucleus. Always give one.'),
      note: S('Tiny caption under the heading, 2 to 6 words, e.g. "DNA lives here". Not a sentence.'),
      color: S('Optional: purple|orange|teal|pink|green|blue|red|gold. Omit for automatic distinct colors.'),
      size: S('Optional: small, medium or large (default medium).'),
      label: S('Optional tiny caption written directly under the picture'),
    },
    ['what', 'heading'],
  ),
  tool(
    'photo',
    'A real photograph or textbook diagram in a slot, taped on like a polaroid, with a handwritten label. Use it when something is too complex or specific to draw: a real place, animal, landmark, machine, or a scene (rainforest, solar farm). For anything with internal structure (a cell, a heart, the water cycle) ask for a diagram: query "animal cell diagram", "human heart anatomy", "water cycle diagram". Max 2 per board. Same slots and heading as part. If it cannot load, a drawn picture appears instead.',
    {
      id: S('short unique id'),
      query: S('2 to 4 specific search words, e.g. "rainforest canopy", "solar panels field", "aurora borealis"'),
      at: S('slot, same as part'),
      heading: S('1 to 3 words label. Always give one.'),
      note: S('2 to 6 words, optional'),
      color: S('optional'),
    },
    ['query', 'heading'],
  ),
  tool(
    'callout',
    'Add or replace the heading label on a part.',
    { target: S('part id'), heading: S('1 to 3 words'), note: S('2 to 6 words'), color: S('optional') },
    ['target', 'heading'],
  ),
  tool(
    'link',
    'Arrow from one part to another to show flow or cause, e.g. sun -> plant. Optional 1 to 2 word label on the arrow.',
    { from: S('part id'), to: S('part id'), label: S('optional'), color: S('optional') },
    ['from', 'to'],
  ),
  tool(
    'highlight',
    'Emphasize a part or node: circle it, underline it or tick it. Use it when you say "this one" or when they get an answer right.',
    { target: S('part or node id'), kind: S('circle|underline|check'), color: S('optional') },
    ['target'],
  ),
  tool(
    'write',
    'Write ONE line of handwriting. style "note" is a keypoint: one fact, date, name, number, definition or formula in 3 to 8 words. Write one for every fact you say, at the moment you start saying it (on a split board they stack down the left, room for about 7; on a diagram board only 2 fit along the bottom). style "takeaway" is the boxed one-line recap. style "question" puts your check question on the board in a "Your turn" box. Full wording, never cut a word.',
    { text: S('the full line, max 100 characters'), style: S('note (default), takeaway or question'), color: S('optional') },
    ['text'],
  ),
  tool(
    'chart',
    'Bar or line chart on an empty board (call new_board first). You supply labels and numbers.',
    {
      kind: S('bar or line'),
      labels: S('2 to 8 short labels separated by |, e.g. Jan|Feb|Mar'),
      values: S('one number per label separated by |, e.g. 4|9|6'),
      color: S('optional'),
    },
    ['kind', 'labels', 'values'],
  ),
  tool(
    'add_node',
    'Flow diagrams only (steps in a process). Draws a labelled oval; layout is automatic. Max 8. Call new_board first.',
    { id: S('short id'), label: S('max 14 characters'), note: S('optional, max 26 characters'), color: S('optional') },
    ['label'],
  ),
  tool('add_arrow', 'Arrow between two existing nodes.', { from: S('node id'), to: S('node id'), label: S('optional, max 16 characters') }, ['from', 'to']),
  tool(
    'sketch',
    'LAST RESORT freehand picture. Same slots and heading as part.',
    {
      id: S('unique id'),
      strokes: S('1 to 10 SVG paths in a 0-100 box separated by ||. Only M L H V C S Q T Z, no arcs.'),
      at: S('slot'),
      heading: S('1 to 3 words'),
      note: S('optional'),
      color: S('optional'),
    },
    ['strokes', 'heading'],
  ),
  tool('erase', 'Remove a part (with its label and arrows) or a written line by id.', { id: S('part id, line id, "takeaway" or "question"') }, ['id']),
]

export const TOOLS = [{ functionDeclarations: declarations }]
