/**
 * Inline Tiled object templates (`.tx`) that Phaser's loader leaves unresolved.
 *
 * When a Tiled object is created from a template, the `.tmj` only stores the
 * fields overridden on that instance (`id`, `x`, `y`, and any per-instance
 * properties); everything inherited — `name`, `type`, the `point` flag, size,
 * default properties — stays in the referenced `.tx` and is *not* expanded by
 * Phaser 3.80's tilemap parser. Template doors thus arrive with no `name`, so
 * `TiledRoom.readObjects` (which matches doors by `name === 'door'`) drops them;
 * template spawns arrive without `point`, so they're never registered.
 *
 * This module fetches each referenced `.tx`, parses the template object, and
 * inlines the missing fields into the cached map JSON before any Room is built.
 * Tiled's override semantics hold: an instance's own field or same-named
 * property always wins over the template's default.
 */

export type TiledProperty = { name: string; type?: string; value: unknown };

export interface TiledObject {
  template?: string;
  name?: string;
  type?: string;
  point?: boolean;
  width?: number;
  height?: number;
  gid?: number;
  properties?: TiledProperty[];
  [key: string]: unknown;
}

interface TiledLayer {
  type: string;
  objects?: TiledObject[];
  layers?: TiledLayer[]; // group layers nest
}

export interface TiledMap {
  layers?: TiledLayer[];
}

/** The bare filename of a template ref, e.g. `../templates/door.tx` -> `door.tx`.
 *  Maps reference templates by a path relative to the `.tmj`, and that prefix
 *  isn't consistent across our maps (`../templates/door.tx` vs `door.tx`), but
 *  every template lives in `public/templates/`, so the basename is the key. */
export function templateName(ref: string): string {
  return ref.split('/').pop() ?? ref;
}

function* objectsIn(map: TiledMap): Generator<TiledObject> {
  const walk = function* (layers: TiledLayer[] | undefined): Generator<TiledObject> {
    for (const layer of layers ?? []) {
      if (layer.type === 'objectgroup') yield* layer.objects ?? [];
      if (layer.type === 'group') yield* walk(layer.layers);
    }
  };
  yield* walk(map.layers);
}

/** Names of every template referenced by a map's objects (deduped). */
export function collectTemplateNames(map: TiledMap): Set<string> {
  const names = new Set<string>();
  for (const obj of objectsIn(map)) {
    if (obj.template) names.add(templateName(obj.template));
  }
  return names;
}

/** Parse a `.tx` document into the template object it defines. */
export function parseTemplateObject(doc: Document): TiledObject {
  const el = doc.querySelector('template > object');
  if (!el) return {};

  const out: TiledObject = {};
  const name = el.getAttribute('name');
  const type = el.getAttribute('type');
  const width = el.getAttribute('width');
  const height = el.getAttribute('height');
  const gid = el.getAttribute('gid');
  if (name != null) out.name = name;
  if (type != null) out.type = type;
  if (width != null) out.width = Number(width);
  if (height != null) out.height = Number(height);
  if (gid != null) out.gid = Number(gid);
  if (el.querySelector('point')) out.point = true;

  const props: TiledProperty[] = [];
  for (const p of el.querySelectorAll('properties > property')) {
    const pType = p.getAttribute('type') ?? undefined;
    const raw = p.getAttribute('value') ?? '';
    props.push({ name: p.getAttribute('name') ?? '', type: pType, value: coerce(raw, pType) });
  }
  if (props.length) out.properties = props;
  return out;
}

function coerce(raw: string, type?: string): unknown {
  if (type === 'bool') return raw === 'true';
  if (type === 'int' || type === 'float') return Number(raw);
  return raw;
}

/** Inline `templates` into every templated object of `map`, mutating it in
 *  place. Returns how many objects were patched. */
export function inlineTemplates(map: TiledMap, templates: Map<string, TiledObject>): number {
  let patched = 0;
  for (const obj of objectsIn(map)) {
    if (!obj.template) continue;
    const tpl = templates.get(templateName(obj.template));
    if (!tpl) continue;

    // Instance field wins; otherwise inherit the template's.
    if (obj.name == null) obj.name = tpl.name;
    if (obj.type == null) obj.type = tpl.type;
    if (obj.width == null) obj.width = tpl.width;
    if (obj.height == null) obj.height = tpl.height;
    if (obj.gid == null && tpl.gid != null) obj.gid = tpl.gid;
    if (obj.point == null && tpl.point) obj.point = true;

    // Merge properties by name: template defaults first, instance overrides win.
    if (tpl.properties?.length) {
      const merged = new Map<string, TiledProperty>();
      for (const p of tpl.properties) merged.set(p.name, p);
      for (const p of obj.properties ?? []) merged.set(p.name, p);
      obj.properties = [...merged.values()];
    }
    patched++;
  }
  return patched;
}
