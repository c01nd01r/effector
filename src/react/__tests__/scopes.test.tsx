import fetch from 'cross-fetch'
import React from 'react'
//@ts-ignore
import {render, container, act} from 'effector/fixtures/react'
import {argumentHistory} from 'effector/fixtures'
import {
  createDomain,
  forward,
  sample,
  attach,
  combine,
  fork,
  allSettled,
  serialize,
  hydrate,
  Scope,
} from 'effector'
import {
  Provider,
  useStore,
  useList,
  useGate,
  useEvent,
  useStoreMap,
  createGate,
} from 'effector-react/ssr'

it('works', async () => {
  const indirectCallFn = jest.fn()

  const app = createDomain()
  const start = app.createEvent<string>()
  const indirectCall = app.createEvent()
  const sendStats = app.createEffect({
    async handler(user: any) {
      await new Promise(resolve => {
        // let bob loading longer
        setTimeout(resolve, user === 'bob' ? 500 : 100)
      })
    },
  })

  const fetchUser = app.createEffect({
    async handler(user: any) {
      return (
        await fetch('https://ssr.effector.dev/api/' + user, {
          method: 'POST',
        })
      ).json()
    },
  })
  //assume that calling start() will trigger some effects
  forward({
    from: start,
    to: fetchUser,
  })

  const user = app.createStore('guest')
  const friends = app.createStore<string[]>([])
  const friendsTotal = friends.map(list => list.length)

  user.on(fetchUser.doneData, (_, result) => result.name)
  friends.on(fetchUser.doneData, (_, result) => result.friends)

  sample({
    source: user,
    clock: fetchUser.done,
    target: sendStats,
  })
  sample({
    source: user,
    clock: indirectCall,
  }).watch(indirectCallFn)

  sendStats.done.watch(() => {
    indirectCall()
  })

  const aliceScope = fork(app)
  const bobScope = fork(app)
  const carolScope = fork(app)
  await Promise.all([
    allSettled(start, {
      scope: aliceScope,
      params: 'alice',
    }),
    allSettled(start, {
      scope: bobScope,
      params: 'bob',
    }),
    allSettled(start, {
      scope: carolScope,
      params: 'carol',
    }),
  ])
  const User = () => <h2>{useStore(user)}</h2>
  const Friends = () => useList(friends, friend => <li>{friend}</li>)
  const Total = () => <small>Total: {useStore(friendsTotal)}</small>

  const App = ({root}: {root: Scope}) => (
    <Provider value={root}>
      <User />
      <b>Friends:</b>
      <ol>
        <Friends />
      </ol>
      <Total />
    </Provider>
  )

  await render(<App root={bobScope} />)
  expect(container.firstChild).toMatchInlineSnapshot(`
    <h2>
      bob
    </h2>
  `)

  expect(serialize(aliceScope)).toMatchInlineSnapshot(`
    Object {
      "-fmlkiq": "alice",
      "mdvpk4": Array [
        "bob",
        "carol",
      ],
    }
  `)
  expect(serialize(bobScope)).toMatchInlineSnapshot(`
    Object {
      "-fmlkiq": "bob",
      "mdvpk4": Array [
        "alice",
      ],
    }
  `)
  expect(indirectCallFn).toBeCalled()
})

test('attach support', async () => {
  const indirectCallFn = jest.fn()

  const app = createDomain()
  const start = app.createEvent<string>()
  const indirectCall = app.createEvent()
  const sendStats = app.createEffect({
    async handler(user: string) {
      await new Promise(resolve => {
        // let bob loading longer
        setTimeout(resolve, user === 'bob' ? 500 : 100)
      })
    },
  })

  const baseUrl = app.createStore('https://ssr.effector.dev/api')

  const fetchJson = app.createEffect<string, any>({
    async handler(url) {
      return (
        await fetch(url, {
          method: 'POST',
        })
      ).json()
    },
  })

  const fetchUser = attach({
    source: {baseUrl},
    effect: fetchJson,
    mapParams: (user, {baseUrl}) => `${baseUrl}/${user}`,
  })

  //assume that calling start() will trigger some effects
  forward({
    from: start,
    to: fetchUser,
  })

  const user = app.createStore('guest')
  const friends = app.createStore([])
  const friendsTotal = friends.map(list => list.length)

  user.on(fetchUser.doneData, (_, result) => result.name)
  friends.on(fetchUser.doneData, (_, result) => result.friends)

  sample({
    source: user,
    clock: fetchUser.done,
    target: sendStats,
  })
  sample({
    source: user,
    clock: indirectCall,
  }).watch(indirectCallFn)

  sendStats.done.watch(() => {
    indirectCall()
  })

  const aliceScope = fork(app)
  const bobScope = fork(app)
  const carolScope = fork(app)
  await Promise.all([
    allSettled(start, {
      scope: aliceScope,
      params: 'alice',
    }),
    allSettled(start, {
      scope: bobScope,
      params: 'bob',
    }),
    allSettled(start, {
      scope: carolScope,
      params: 'carol',
    }),
  ])
  const User = () => <h2>{useStore(user)}</h2>
  const Friends = () => useList(friends, friend => <li>{friend}</li>)
  const Total = () => <small>Total: {useStore(friendsTotal)}</small>

  const App = ({root}: {root: Scope}) => (
    <Provider value={root}>
      <User />
      <b>Friends:</b>
      <ol>
        <Friends />
      </ol>
      <Total />
    </Provider>
  )

  await render(<App root={bobScope} />)
  expect(container.firstChild).toMatchInlineSnapshot(`
    <h2>
      bob
    </h2>
  `)
  expect(serialize(aliceScope)).toMatchInlineSnapshot(`
    Object {
      "-d31x3q": Array [
        "bob",
        "carol",
      ],
      "by4ois": "https://ssr.effector.dev/api",
      "u8c20o": "alice",
    }
  `)
  expect(serialize(bobScope)).toMatchInlineSnapshot(`
    Object {
      "-d31x3q": Array [
        "alice",
      ],
      "by4ois": "https://ssr.effector.dev/api",
      "u8c20o": "bob",
    }
  `)
  expect(indirectCallFn).toBeCalled()
})

test('computed values support', async () => {
  const app = createDomain()

  const fetchUser = app.createEffect<string, {name: string; friends: string[]}>(
    {
      async handler(user) {
        const req = await fetch(`https://ssr.effector.dev/api/${user}`, {
          method: 'POST',
        })
        return req.json()
      },
    },
  )
  const start = app.createEvent<string>()
  forward({from: start, to: fetchUser})
  const name = app
    .createStore('guest')
    .on(fetchUser.done, (_, {result}) => result.name)

  const friends = app
    .createStore<string[]>([])
    .on(fetchUser.done, (_, {result}) => result.friends)
  const friendsTotal = friends.map(list => list.length)

  const Total = () => <small>Total:{useStore(friendsTotal)}</small>
  const User = () => <b>User:{useStore(name)}</b>
  const App = ({root}: {root: Scope}) => (
    <Provider value={root}>
      <section>
        <User />
        <Total />
      </section>
    </Provider>
  )

  const serverScope = fork(app)
  await allSettled(start, {
    scope: serverScope,
    params: 'alice',
  })
  const serialized = serialize(serverScope)

  hydrate(app, {
    values: serialized,
  })

  const clientScope = fork(app)

  await render(<App root={clientScope} />)

  expect(container.firstChild).toMatchInlineSnapshot(`
    <section>
      <b>
        User:
        alice
      </b>
      <small>
        Total:
        2
      </small>
    </section>
  `)
})

test('useGate support', async () => {
  const app = createDomain()
  const getMessagesFx = app.createEffect<{chatId: string}, string[]>({
    async handler({chatId}) {
      return ['hi bob!', 'Hello, Alice']
    },
  })

  const messagesAmount = app
    .createStore(0)
    .on(getMessagesFx.doneData, (_, messages) => messages.length)

  const activeChatGate = createGate<{chatId: string}>({domain: app})

  forward({from: activeChatGate.open, to: getMessagesFx})

  const ChatPage = ({chatId}: {chatId: string}) => {
    useGate(activeChatGate, {chatId})
    return (
      <div>
        <header>Chat:{chatId}</header>
        <p>Messages total:{useStore(messagesAmount)}</p>
      </div>
    )
  }
  const App = ({root}: {root: Scope}) => (
    <Provider value={root}>
      <ChatPage chatId="chat01" />
    </Provider>
  )

  const serverScope = fork(app)
  await render(<App root={serverScope} />)

  expect(container.firstChild).toMatchInlineSnapshot(`
    <div>
      <header>
        Chat:
        chat01
      </header>
      <p>
        Messages total:
        2
      </p>
    </div>
  `)

  const clientScope = fork(app, {
    values: serialize(serverScope),
  })

  await render(<App root={clientScope} />)

  expect(container.firstChild).toMatchInlineSnapshot(`
    <div>
      <header>
        Chat:
        chat01
      </header>
      <p>
        Messages total:
        2
      </p>
    </div>
  `)
})

test('allSettled effect calls', async () => {
  const fn = jest.fn()
  const app = createDomain()

  const fetchUser = app.createEffect<string, {name: string; friends: string[]}>(
    {
      async handler(user) {
        const req = await fetch(`https://ssr.effector.dev/api/${user}`, {
          method: 'POST',
        })
        return req.json()
      },
    },
  )

  const serverScope = fork(app)

  await allSettled(fetchUser, {
    scope: serverScope,
    params: 'alice',
  })
    .then(fn)
    .catch(err => {
      console.error(err)
    })
  expect(fn).toBeCalled()
})

test('useEvent and effect calls', async () => {
  const app = createDomain()
  const inc = app.createEvent()
  const count = app.createStore(0).on(inc, x => x + 1)
  const fx = app.createEffect(async () => {
    inc()
  })
  const scope = fork(app)
  const App = () => {
    const fxe = useEvent(fx)
    const x = useStore(count)
    return (
      <div>
        <button id="btn" onClick={() => fxe()}>
          clicked-{x}-times
        </button>
      </div>
    )
  }
  await render(
    <Provider value={scope}>
      <App />
    </Provider>,
  )
  expect(container.firstChild).toMatchInlineSnapshot(`
    <div>
      <button
        id="btn"
      >
        clicked-
        0
        -times
      </button>
    </div>
  `)
  await act(async () => {
    container.firstChild.querySelector('#btn').click()
  })
  expect(container.firstChild).toMatchInlineSnapshot(`
    <div>
      <button
        id="btn"
      >
        clicked-
        1
        -times
      </button>
    </div>
  `)
  expect(count.getState()).toBe(0)
  expect(scope.getState(count)).toBe(1)
})

test('object in useEvent', async () => {
  const app = createDomain()
  const inc = app.createEvent()
  const dec = app.createEvent()
  const fx = app.createEffect(async () => 100)
  const count = app
    .createStore(0)
    .on(inc, x => x + 1)
    .on(dec, x => x - 1)
    .on(fx.doneData, (x, v) => x + v)
  const scope = fork(app)
  const App = () => {
    const hndl = useEvent({fx, inc, dec})
    const x = useStore(count)
    return (
      <div>
        <span id="value">current value:{x}</span>
        <button id="fx" onClick={() => hndl.fx()}>
          fx
        </button>
        <button id="inc" onClick={() => hndl.inc()}>
          inc
        </button>
        <button id="dec" onClick={() => hndl.dec()}>
          dec
        </button>
      </div>
    )
  }
  await render(
    <Provider value={scope}>
      <App />
    </Provider>,
  )
  expect(container.firstChild).toMatchInlineSnapshot(`
    <div>
      <span
        id="value"
      >
        current value:
        0
      </span>
      <button
        id="fx"
      >
        fx
      </button>
      <button
        id="inc"
      >
        inc
      </button>
      <button
        id="dec"
      >
        dec
      </button>
    </div>
  `)
  await act(async () => {
    container.firstChild.querySelector('#fx').click()
    container.firstChild.querySelector('#inc').click()
    container.firstChild.querySelector('#inc').click()
  })
  expect(container.firstChild).toMatchInlineSnapshot(`
    <div>
      <span
        id="value"
      >
        current value:
        102
      </span>
      <button
        id="fx"
      >
        fx
      </button>
      <button
        id="inc"
      >
        inc
      </button>
      <button
        id="dec"
      >
        dec
      </button>
    </div>
  `)
  await act(async () => {
    container.firstChild.querySelector('#dec').click()
  })
  expect(count.getState()).toBe(0)
  expect(scope.getState(count)).toBe(101)
})

test('array in useEvent', async () => {
  const app = createDomain()
  const inc = app.createEvent()
  const dec = app.createEvent()
  const fx = app.createEffect(async () => 100)
  const count = app
    .createStore(0)
    .on(inc, x => x + 1)
    .on(dec, x => x - 1)
    .on(fx.doneData, (x, v) => x + v)
  const scope = fork(app)
  const App = () => {
    const [a, b, c] = useEvent([fx, inc, dec])
    const x = useStore(count)
    return (
      <div>
        <span id="value">current value:{x}</span>
        <button id="fx" onClick={() => a()}>
          fx
        </button>
        <button id="inc" onClick={() => b()}>
          inc
        </button>
        <button id="dec" onClick={() => c()}>
          dec
        </button>
      </div>
    )
  }
  await render(
    <Provider value={scope}>
      <App />
    </Provider>,
  )
  expect(container.firstChild).toMatchInlineSnapshot(`
    <div>
      <span
        id="value"
      >
        current value:
        0
      </span>
      <button
        id="fx"
      >
        fx
      </button>
      <button
        id="inc"
      >
        inc
      </button>
      <button
        id="dec"
      >
        dec
      </button>
    </div>
  `)
  await act(async () => {
    container.firstChild.querySelector('#fx').click()
    container.firstChild.querySelector('#inc').click()
    container.firstChild.querySelector('#inc').click()
  })
  expect(container.firstChild).toMatchInlineSnapshot(`
    <div>
      <span
        id="value"
      >
        current value:
        102
      </span>
      <button
        id="fx"
      >
        fx
      </button>
      <button
        id="inc"
      >
        inc
      </button>
      <button
        id="dec"
      >
        dec
      </button>
    </div>
  `)
  await act(async () => {
    container.firstChild.querySelector('#dec').click()
  })
  expect(count.getState()).toBe(0)
  expect(scope.getState(count)).toBe(101)
})

describe('useStoreMap', () => {
  it('should render', async () => {
    const app = createDomain()

    const userRemove = app.createEvent<string>()
    const userAgeChange = app.createEvent<{nickname: string; age: number}>()
    const $users = app.createStore<Record<string, {age: number; name: string}>>(
      {
        alex: {age: 20, name: 'Alex'},
        john: {age: 30, name: 'John'},
      },
    )
    const $userNames = app.createStore(['alex', 'john'])

    $userNames.on(userRemove, (list, username) =>
      list.filter(item => item !== username),
    )
    $users
      .on(userRemove, (users, nickname) => {
        const upd = {...users}
        delete upd[nickname]
        return upd
      })
      .on(userAgeChange, (users, {nickname, age}) => ({
        ...users,
        [nickname]: {...users[nickname], age},
      }))

    const Card = ({nickname}: {nickname: string}) => {
      const {name, age} = useStoreMap({
        store: $users,
        keys: [nickname],
        fn: (users, [nickname]) => users[nickname],
      })
      return (
        <li>
          {name}: {age}
        </li>
      )
    }

    const Cards = () => (
      <ul>
        {useList($userNames, name => (
          <Card nickname={name} key={name} />
        ))}
      </ul>
    )

    const App = ({root}: {root: Scope}) => (
      <Provider value={root}>
        <Cards />
      </Provider>
    )

    const scope = fork(app)

    await render(<App root={scope} />)
    expect(container.firstChild).toMatchInlineSnapshot(`
      <ul>
        <li>
          Alex
          : 
          20
        </li>
        <li>
          John
          : 
          30
        </li>
      </ul>
    `)
    await act(async () => {
      await allSettled(userAgeChange, {
        scope,
        params: {nickname: 'alex', age: 21},
      })
    })

    expect(container.firstChild).toMatchInlineSnapshot(`
      <ul>
        <li>
          Alex
          : 
          21
        </li>
        <li>
          John
          : 
          30
        </li>
      </ul>
    `)
    await act(async () => {
      await allSettled(userRemove, {scope, params: 'alex'})
    })
    expect(container.firstChild).toMatchInlineSnapshot(`
      <ul>
        <li>
          John
          : 
          30
        </li>
      </ul>
    `)
  })
  it('should support domains', async () => {
    const app = createDomain()
    const toggle = app.createEvent()
    const inc = app.createEvent()
    const $show = app
      .createStore('A')
      .on(toggle, current => (current === 'A' ? 'B' : 'A'))
    const $a = app.createStore(10).on(inc, x => x + 1)
    const $b = app.createStore(20).on(inc, x => x + 1)
    const View = () => {
      const current = useStore($show)
      const selectedStore = current === 'A' ? $a : $b
      const value = useStoreMap({
        store: selectedStore,
        keys: [selectedStore],
        fn: x => x,
      })
      return <div>{value}</div>
    }
    const App = ({root}: {root: Scope}) => (
      <Provider value={root}>
        <View />
      </Provider>
    )

    const scope = fork(app)
    await render(<App root={scope} />)
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div>
        10
      </div>
    `)
    await act(async () => {
      await allSettled(inc, {scope})
    })
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div>
        11
      </div>
    `)
    await act(async () => {
      await allSettled(toggle, {scope})
    })
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div>
        21
      </div>
    `)
    await act(async () => {
      await allSettled(inc, {scope})
    })
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div>
        22
      </div>
    `)
    await act(async () => {
      await allSettled(toggle, {scope})
    })
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div>
        12
      </div>
    `)
  })
  test('updateFilter support', async () => {
    const app = createDomain()
    const setValue = app.createEvent<number>()
    const $store = app.createStore(0).on(setValue, (_, x) => x)

    const View = () => {
      const x = useStoreMap({
        store: $store,
        keys: [],
        fn: x => x,
        updateFilter: (update: number, current: number) => update % 2 === 0,
      })
      return <div>{x}</div>
    }
    const App = ({root}: {root: Scope}) => (
      <Provider value={root}>
        <View />
      </Provider>
    )
    const scope = fork(app)

    await render(<App root={scope} />)
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div>
        0
      </div>
    `)
    await act(async () => {
      await allSettled(setValue, {scope, params: 2})
    })
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div>
        2
      </div>
    `)
    await act(async () => {
      await allSettled(setValue, {scope, params: 3})
    })
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div>
        2
      </div>
    `)
  })
})
