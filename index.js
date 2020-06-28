import moment from 'moment'
import async from 'async'
import { createStore } from 'redux'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { counter } from './reducers'
// import { calculateMarks, analyseData, filterData } from './analyseData'
import { getCleanData, analyseData, getMonthlyList } from './analyseDataNew'
// import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2018'
const endingDateStr = '31/12/2018'

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

getCleanData('01/01/2019').then(() => {
    const yearly = analyseData("01/01/2018", "01/01/2019")
    getMonthlyList(yearly)
    // console.log(store.getState()['selectedList'])
})
