import moment from 'moment'
import { cleanData } from './cleanData'
import { exceptionList } from './config'
import { store } from './'

const getCleanData = (dateStr) => {
    const dateMoment = moment(dateStr, 'DD/MM/YYYY')
    const oneYearStrBeforeCurrent = dateMoment.clone().subtract(1, "year").format('DD/MM/YYYY');
    const oneYearStrAfterCurrent = dateMoment.clone().add(1, "year").format('DD/MM/YYYY');
    const nextMonthMoment = dateMoment.clone().add(1, "month")
    let nextMonthData = {}
    return cleanData(oneYearStrBeforeCurrent, dateStr).then((cleanedData) => {
        {
            // console.log('c', cleanedData)
            store.dispatch({ type: 'CLEANED_DATA_PAST', data: cleanedData })
        }
    }).then(() => cleanData(dateStr, oneYearStrAfterCurrent))
        .then((cleanedData) => {
            {
                // console.log('c', cleanedData)s
                store.dispatch({ type: 'CLEANED_DATA_CURRENT', data: cleanedData })
            }
        })
}

export { getCleanData }