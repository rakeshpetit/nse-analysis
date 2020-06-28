
const INITIAL_STATE = {
    count: 0
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
        default:
            return state
    }
}
export { counter }