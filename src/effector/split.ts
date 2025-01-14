import {Event} from './unit.h'
import {NodeUnit, Cmd} from './index.h'
import {is, isFunction, isObject} from './is'
import {forIn, includes} from './collection'
import {addRefOp, createStateRef} from './stateRef'
import {readTemplate} from './region'
import {createLinkNode} from './forward'
import {processArgsToConfig} from './config'
import {step} from './typedef'
import {createNode} from './createNode'
import {launch} from './kernel'
import {getStoreState} from './getter'
import {REG_A} from './tag'
import {throwError} from './throw'
import {createEvent} from './createUnit'

const launchCase = (
  scopeTargets: Record<string, NodeUnit>,
  field: string,
  data: any,
  stack: any,
) => {
  const target = scopeTargets[field]
  if (target) {
    launch({
      target,
      params: Array.isArray(target) ? target.map(() => data) : data,
      defer: true,
      stack,
    })
  }
}

export function split(...args: any[]): any {
  let targets: Record<string, Event<any> | NodeUnit>
  let [[source, match], metadata] = processArgsToConfig(args)
  const knownCases = !match
  if (knownCases) {
    targets = source.cases
    match = source.match
    source = source.source
  }
  const matchIsUnit = is.store(match)
  const matchIsFunction = !is.unit(match) && isFunction(match)
  const matchIsShape = !matchIsUnit && !matchIsFunction && isObject(match)
  if (!targets!) targets = {}
  if (!knownCases) {
    if (!matchIsShape) throwError('match should be an object')
    forIn(match, (_, key) => {
      //@ts-ignore
      targets[key] = createEvent(metadata)
    })
    targets.__ = createEvent(metadata)
  }
  //@ts-ignore
  const template = readTemplate()
  const owners = new Set(
    ([] as NodeUnit[]).concat(source, Object.values(targets)),
  )
  const caseNames = Object.keys(
    matchIsUnit || matchIsFunction ? targets : match,
  )
  let splitterSeq: Array<Cmd | false>
  if (matchIsUnit || matchIsFunction) {
    if (matchIsUnit) owners.add(match)
    splitterSeq = [
      matchIsUnit && step.barrier({priority: 'sampler'}),
      matchIsUnit &&
        step.mov({
          store: getStoreState(match),
          to: 'a',
        }),
      step.filter({
        fn(data, scopeTargets, stack) {
          const value = String(matchIsUnit ? stack.a : match(data))
          launchCase(
            scopeTargets,
            includes(caseNames, value) ? value : '__',
            data,
            stack,
          )
        },
      }),
    ]
  } else if (matchIsShape) {
    const lastValues = createStateRef({})
    lastValues.type = 'shape'
    const updaterSteps = [
      step.mov({
        store: lastValues,
        to: REG_A,
      }),
      step.compute({
        fn(upd, {key}, {a}) {
          a[key] = upd
        },
      }),
    ]
    const units = [] as string[]
    let needBarrier: boolean
    forIn(match, (storeOrFn: any, key) => {
      if (is.unit(storeOrFn)) {
        needBarrier = true
        units.push(key)
        owners.add(storeOrFn)
        const updater = createLinkNode(storeOrFn, [], {
          node: updaterSteps,
          scope: {key},
        })
        if (is.store(storeOrFn)) {
          lastValues.current[key] = storeOrFn.getState()
          const storeRef = getStoreState(storeOrFn)
          addRefOp(lastValues, {
            type: 'field',
            field: key,
            from: storeRef,
          })
          if (template) {
            if (!includes(template.plain, storeRef)) {
              updater.seq.unshift(template.loader)
            }
          }
        }
      }
    })
    if (needBarrier! && template) {
      template.plain.push(lastValues)
    }
    splitterSeq = [
      needBarrier! && step.barrier({priority: 'sampler'}),
      needBarrier! &&
        step.mov({
          store: lastValues,
          to: 'a',
        }),
      step.filter({
        fn(data, scopeTargets, stack) {
          for (let i = 0; i < caseNames.length; i++) {
            const caseName = caseNames[i]
            const caseValue = includes(units, caseName)
              ? stack.a[caseName]
              : match[caseName](data)
            if (caseValue) {
              launchCase(scopeTargets, caseName, data, stack)
              return
            }
          }
          launchCase(scopeTargets, '__', data, stack)
        },
      }),
    ]
  } else {
    throwError('expect match to be unit, function or object')
  }
  createNode({
    meta: {
      onCopy: Object.keys(targets),
      op: 'split',
    },
    parent: source,
    scope: targets,
    node: splitterSeq!,
    family: {
      type: 'crosslink',
      owners: Array.from(owners),
    },
    regional: true,
  })
  if (!knownCases) return targets
}
