import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// Dexie/fake-indexeddb arbeitet asynchron; unter CPU-Last darf findBy*/waitFor länger brauchen.
configure({ asyncUtilTimeout: 5000 })
