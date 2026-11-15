import { describe, expect, it } from 'vitest'
import { yearTicks } from '../../components/series-chart'

describe('series chart year ticks', () => {
  it('labels both ends and every fifth year, never crowding an end', () => {
    expect(yearTicks(2001, 2024)).toEqual([2001, 2005, 2010, 2015, 2020, 2024])
    expect(yearTicks(1981, 2024)).toEqual([1981, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024])
    expect(yearTicks(2003, 2022)).toEqual([2003, 2010, 2015, 2022]) // 2005 and 2020 sit within 2 years of an end
    expect(yearTicks(2010, 2010)).toEqual([2010])
  })
})
