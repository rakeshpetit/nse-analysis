import moment from 'moment'
import async from 'async'
import { createStore } from 'redux'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { counter } from './reducers'
// import { calculateMarks, analyseData, filterData } from './analyseData'
import { getCleanData, analyseData } from './analyseDataNew'
// import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2017'
const endingDateStr = '31/12/2017'

const urls = getURLs(startingDateStr, endingDateStr)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
// writeToCsv(startingDateStr, endingDateStr)

export const store = createStore(counter)

// store.dispatch({ type: 'INCREMENT' })
// store.dispatch({ type: 'INCREMENT' })
// console.log(store.getState())
// store.dispatch({ type: 'DECREMENT' })
// store.dispatch({ type: 'DECREMENT' })

getCleanData('01/01/2017').then(() => {
    const currentYear = store.getState()['cleanCurrentYearPrice']
    // console.log('currentYear', currentYear['NESCO'])
    analyseData(startingDateStr, endingDateStr)
    
})
