
const INITIAL_STATE = {
    count: 0
}

const saveSelectedList = (action, state) => {
    const selectedList = state.selectedList
    if(!selectedList){
        return { ...state, 
            selectedList: {
                [action.data.dateKey]: action.data.monthlyList
            }
        }
    } else {
        return {
            ...state,
            selectedList: {
                ...selectedList,
                [action.data.dateKey]: action.data.monthlyList
            }
        }
    }
}

function counter(state = INITIAL_STATE, action) {
    switch (action.type) {
        case 'CLEANED_DATA_PAST':
            return { ...state, cleanLastYearPrice: action.data }
        case 'CLEANED_DATA_CURRENT':
            return { ...state, cleanCurrentYearPrice: action.data }
        case 'INCREMENT':
            return { ...state, count: state.count + 1}
        case 'DECREMENT':
            return { ...state, count: state.count - 1 }
        case 'SAVE_SELECTED_LIST':
            return saveSelectedList(action,state)
        default:
            return state
    }
}
export { counter }