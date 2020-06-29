import fs from 'fs';
import { createStore } from 'redux'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { counter } from './reducers'
import { getCleanData, calculateForYear } from './analyseDataNew'
import { fetchListJSONdata } from './analyseReturns'
import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2018'
const endingDateStr = '31/12/2018'

const urls = getURLs(startingDateStr, endingDateStr)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
// writeToCsv(startingDateStr, endingDateStr)

export const store = createStore(counter)

// calculateForYear(2019).then(() => {
//     const selectedList = store.getState()['selectedList']
//     fs.writeFile(`list.json`, JSON.stringify(selectedList), 'utf8', () => { });
// })

fetchListJSONdata().then((listData) => {
    // console.log('list', listData)
    store.dispatch({
        type: 'SAVE_SELECTED_LIST',
        data: listData
    })
}).then(() => getCleanData('01/01/2019'))
.then(() => {
    const state = Object.keys(store.getState()['cleanCurrentYearPrice'])
    console.log('s', state)
})

