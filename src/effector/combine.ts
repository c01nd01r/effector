import type {Store} from './unit.h'
import {createStore} from './createUnit'
import {createStateRef, addRefOp} from './stateRef'
import {step} from './typedef'
import {onConfigNesting} from './config'
import {getGraph, getStoreState} from './getter'
import {is, isFunction, isObject} from './is'
import {unitObjectName} from './naming'
import {createLinkNode} from './forward'
import {throwError} from './throw'
import {readTemplate} from './region'
import {forIn, includes} from './collection'
import {BARRIER, MAP, REG_A, VALUE} from './tag'

export function combine(...args: any[]): Store<any> {
  let handler
  let stores
  let config
  onConfigNesting(args[0], (injectedData, userConfig) => {
    config = injectedData
    args = userConfig
  })
  const rawHandler = args[args.length - 1]
  if (isFunction(rawHandler)) {
    stores = args.slice(0, -1)
    handler = rawHandler
  } else {
    stores = args
  }

  let structStoreShape
  let shapeReady
  if (stores.length === 1) {
    const obj = stores[0]
    /*
      without edge case combine(Color, (Color) => '~')
      */
    if (!is.store(obj)) {
      /*
      case combine([R,G,B], ([R,G,B]) => '~')
      case combine({R,G,B}, ({R,G,B}) => '~')

      edge case combine([Color], ([Color]) => '~')
      edge case combine({Color}, ({Color}) => '~')

      edge case combine([R,G,B])
      edge case combine({R,G,B})

      edge case combine([Color])
      edge case combine({Color})
      */
      structStoreShape = obj
      shapeReady = true
    }
  }
  if (!shapeReady) {
    /*
    case combine(R,G,B, (R,G,B) => '~')
    */
    structStoreShape = stores
    /*
    without edge case combine(R,G,B)
    without edge case combine(Color)
    */
    if (handler) {
      handler = spreadArgs(handler)
    }
  }
  if (!isObject(structStoreShape)) throwError('shape should be an object')
  return storeCombination(
    Array.isArray(structStoreShape),
    structStoreShape,
    config,
    handler,
  )
}

const spreadArgs = (fn: Function) => (list: any[]) => fn(...list)

const storeCombination = (
  isArray: boolean,
  obj: any,
  config?: string,
  fn?: (upd: any) => any,
) => {
  const clone = isArray ? (list: any) => list.slice() : (obj: any) => ({...obj})
  const defaultState: any = isArray ? [] : {}
  const template = readTemplate()
  const stateNew = clone(defaultState)
  const rawShape = createStateRef(stateNew)
  const isFresh = createStateRef(true)
  rawShape.type = isArray ? 'list' : 'shape'
  if (template) {
    template.plain.push(rawShape, isFresh)
  }
  const store = createStore(stateNew, {
    name: config ? config : unitObjectName(obj),
  })
  getGraph(store).meta.isCombine = true
  const node = [
    step.check.defined(),
    step.mov({
      store: rawShape,
      to: REG_A,
    }),
    //prettier-ignore
    step.filter({
      fn: (upd, {key}, {a}) => upd !== a[key],
    }),
    step.mov({
      store: isFresh,
      to: 'b',
    }),
    step.compute({
      fn(upd, {clone, key}, reg) {
        if (reg.b) {
          reg.a = clone(reg.a)
        }
        reg.a[key] = upd
      },
    }),
    step.mov({
      from: REG_A,
      target: rawShape,
    }),
    step.mov({
      from: VALUE,
      store: false,
      target: isFresh,
    }),
    step.barrier({priority: BARRIER}),
    step.mov({
      from: VALUE,
      store: true,
      target: isFresh,
    }),
    step.mov({store: rawShape}),
    fn && step.compute({fn}),
    step.check.changed({
      store: getStoreState(store),
    }),
  ]
  forIn(obj, (child: Store<any> | any, key) => {
    if (!is.store(child)) {
      stateNew[key] = defaultState[key] = child
      return
    }
    defaultState[key] = child.defaultState
    stateNew[key] = child.getState()
    const linkNode = createLinkNode(child, store, {
      scope: {key, clone},
      node,
      meta: {op: 'combine'},
    })
    const childRef = getStoreState(child)
    addRefOp(rawShape, {
      type: 'field',
      field: key,
      from: childRef,
    })
    if (template) {
      if (!includes(template.plain, childRef)) {
        linkNode.seq.unshift(template.loader)
      }
    }
  })

  store.defaultShape = obj
  addRefOp(getStoreState(store), {
    type: MAP,
    from: rawShape,
    fn,
  })
  if (!template) {
    store.defaultState = fn
      ? (getStoreState(store).current = fn(stateNew))
      : defaultState
  }
  return store
}

export function createStoreObject(...args: any[]) {
  console.error('createStoreObject is deprecated, use combine instead')
  return combine(...args)
}
