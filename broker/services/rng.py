"""
Deterministic RNG utilities - Python port of JavaScript implementation
CRITICAL: Must produce identical results to the JavaScript version
"""

import math


def xmur3(string: str) -> callable:
    """
    xmur3 string hash - produces seed generator
    Python port of the JavaScript xmur3 function
    """
    h = 1779033703
    for char in string:
        h ^= ord(char)
        h = (h * 3432918353) & 0xFFFFFFFF
        h = ((h << 13) | (h >> 19)) & 0xFFFFFFFF
    
    def seed_fn():
        nonlocal h
        h ^= h >> 16
        h = (h * 2246822507) & 0xFFFFFFFF
        h ^= h >> 13
        h = (h * 3266489909) & 0xFFFFFFFF
        h ^= h >> 16
        return h & 0xFFFFFFFF
    
    return seed_fn


def sfc32(a: int, b: int, c: int, d: int) -> callable:
    """
    sfc32 PRNG - simple fast counter
    Python port of the JavaScript sfc32 function
    """
    state = {
        'a': a & 0xFFFFFFFF,
        'b': b & 0xFFFFFFFF,
        'c': c & 0xFFFFFFFF,
        'd': d & 0xFFFFFFFF
    }
    
    def rng():
        a = state['a']
        b = state['b']
        c = state['c']
        d = state['d']
        
        t = (a + b) & 0xFFFFFFFF
        a = (b ^ (b >> 9)) & 0xFFFFFFFF
        b = (c + (c << 3)) & 0xFFFFFFFF
        c = ((c << 21) | (c >> 11)) & 0xFFFFFFFF
        d = (d + 1) & 0xFFFFFFFF
        t = (t + d) & 0xFFFFFFFF
        c = (c + t) & 0xFFFFFFFF
        
        state['a'] = a
        state['b'] = b
        state['c'] = c
        state['d'] = d
        
        return (t & 0xFFFFFFFF) / 4294967296.0
    
    return rng


def gaussian(rng: callable) -> float:
    """
    Box-Muller transform for Gaussian distribution
    """
    u1 = rng() or 1e-12
    u2 = rng() or 1e-12
    return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)


def create_seeded_rng(seed_string: str) -> callable:
    """
    Create a seeded RNG from a string seed
    """
    seed = xmur3(seed_string)
    return sfc32(seed(), seed(), seed(), seed())
