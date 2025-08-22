import re

MUSTACHE_REGEX = re.compile(r"{{([^{}]*)}}")
VARIABLE_REGEX = re.compile(r"^[a-zA-Z][a-zA-Z_]*$")


def is_valid_variable_name(variable: str) -> bool:
    """Checks if a string is a valid variable name."""
    return bool(VARIABLE_REGEX.match(variable))


def extract_variables(mustache_string: str) -> list[str]:
    """Extracts valid variable names from a mustache-style template string."""
    matches = [
        match.strip() for match in MUSTACHE_REGEX.findall(mustache_string)
    ]
    return sorted(list(set(filter(is_valid_variable_name, matches))))
