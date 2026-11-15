import { describe, expect, it } from 'vitest'
import { bestMatch } from '../../components/location-selector'

describe('country / state autocomplete', () => {
  const countries = ['Algeria', 'Argentina', 'Mexico', 'Niger', 'Nigeria', 'United States of America']

  it('prefers an exact name, then a name that starts with the text, then one that contains it', () => {
    expect(bestMatch(countries, 'niger')).toBe('Niger')
    expect(bestMatch(countries, 'Arg')).toBe('Argentina')
    expect(bestMatch(countries, 'states')).toBe('United States of America')
    expect(bestMatch(countries, '  mex ')).toBe('Mexico')
  })

  it('ignores accents and case, so Spanish names are easy to type', () => {
    const states = ['Buenos Aires', 'Córdoba', 'Entre Ríos', 'Yucatán']
    expect(bestMatch(states, 'cord')).toBe('Córdoba')
    expect(bestMatch(states, 'YUCATAN')).toBe('Yucatán')
    expect(bestMatch(states, 'rios')).toBe('Entre Ríos')
  })

  it('returns nothing for empty or unknown text', () => {
    expect(bestMatch(countries, '')).toBeNull()
    expect(bestMatch(countries, 'Atlantis')).toBeNull()
  })
})
