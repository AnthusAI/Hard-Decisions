"""An independent solver for ProofWriter theories, used to check gold labels.

ProofWriter ships each theory both as text and as structured atoms: ``("Erin" "is" "cold" "+")``
facts and ``(((atom ...)) -> atom)`` rules whose only variable is ``someone`` / ``something``.
This module grounds the rules over the theory's constants and recomputes every label from the
structured form, so a sampled item whose published label disagrees fails the build.

Polarity ``+`` is a positive atom and ``-`` an explicit negation (OWA facts and rule heads). ``~``
marks "not" in a rule body, and its meaning depends on the semantics, as ProofWriter's own labels
confirm on every sampled item: under OWA it is explicit negation (the body holds only if the
negated atom is derived, so the theory stays monotone); under CWA it is negation as failure,
evaluated with the alternating fixpoint (the well-founded semantics, which equals the stratified
model for the stratified theories ProofWriter generates). OWA: a statement is true if derived,
false if its explicit negation is derived, otherwise unknown. CWA: anything not derived is false.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, FrozenSet, List, Set, Tuple

ATOM = re.compile(r'\("([^"]*)" "([^"]*)" "([^"]*)" "([+~-])"\)')
VARIABLES = ("someone", "something")

# (subject, predicate, object, polarity) with polarity "+" or "-".
Atom = Tuple[str, str, str, str]


@dataclass(frozen=True)
class Rule:
    body: Tuple[Atom, ...]
    head: Atom


def parse_atom(representation: str) -> Atom:
    match = ATOM.fullmatch(representation.strip())
    if match is None:
        raise ValueError(f"not an atom: {representation!r}")
    return match.groups()  # type: ignore[return-value]


def parse_rule(representation: str) -> Rule:
    body_text, head_text = representation.split("->")
    body = tuple(m.groups() for m in ATOM.finditer(body_text))
    heads = [m.groups() for m in ATOM.finditer(head_text)]
    if not body or len(heads) != 1:
        raise ValueError(f"not a rule: {representation!r}")
    return Rule(body=body, head=heads[0])  # type: ignore[arg-type]


def _constants(facts: List[Atom], rules: List[Rule], query: Atom) -> List[str]:
    found: Set[str] = set()
    atoms = list(facts) + [query]
    for rule in rules:
        atoms.extend(rule.body)
        atoms.append(rule.head)
    for subject, _predicate, obj, _pol in atoms:
        for term in (subject, obj):
            if term not in VARIABLES:
                found.add(term)
    return sorted(found)


def _substitute(atom: Atom, binding: str) -> Atom:
    subject, predicate, obj, polarity = atom
    return (binding if subject in VARIABLES else subject, predicate,
            binding if obj in VARIABLES else obj, polarity)


def ground(rules: List[Rule], constants: List[str]) -> List[Rule]:
    grounded: List[Rule] = []
    for rule in rules:
        uses_variable = any(a[0] in VARIABLES or a[2] in VARIABLES for a in rule.body + (rule.head,))
        if not uses_variable:
            grounded.append(rule)
            continue
        for constant in constants:
            grounded.append(Rule(body=tuple(_substitute(a, constant) for a in rule.body),
                                 head=_substitute(rule.head, constant)))
    return grounded


def _gamma(facts: List[Atom], rules: List[Rule], assumed: Set[Atom]) -> Set[Atom]:
    """Least model where a ``~`` literal holds iff its positive atom is not in ``assumed``
    (the Gelfond-Lifschitz reduct)."""
    derived: Set[Atom] = set(facts)
    changed = True
    while changed:
        changed = False
        for rule in rules:
            if rule.head in derived:
                continue
            for subject, predicate, obj, polarity in rule.body:
                if polarity == "~":
                    ok = (subject, predicate, obj, "+") not in assumed
                else:
                    ok = (subject, predicate, obj, polarity) in derived
                if not ok:
                    break
            else:
                derived.add(rule.head)
                changed = True
    return derived


def _model(facts: List[Atom], rules: List[Rule]) -> Tuple[Set[Atom], Set[Atom]]:
    """(certainly derived, possibly derived) under the alternating fixpoint."""
    lower: Set[Atom] = set()
    upper = _gamma(facts, rules, lower)
    while True:
        new_lower = _gamma(facts, rules, upper)
        new_upper = _gamma(facts, rules, new_lower)
        if new_lower == lower and new_upper == upper:
            return lower, upper
        lower, upper = new_lower, new_upper


def solve(semantics: str, facts: List[Atom], rules: List[Rule], statement: Atom) -> str:
    """The label for one statement: ``"True"``, ``"False"`` or (OWA only) ``"Unknown"``.

    Raises ``ValueError`` when the well-founded model leaves the statement undefined, so such an
    item can never be sampled with a silently wrong label.
    """
    if semantics == "OWA":
        rules = [Rule(body=tuple((a[0], a[1], a[2], "-" if a[3] == "~" else a[3]) for a in r.body),
                      head=r.head) for r in rules]
    rules = ground(rules, _constants(facts, rules, statement))
    subject, predicate, obj, polarity = statement
    lower, upper = _model(facts, rules)
    if semantics == "OWA":
        opposite = (subject, predicate, obj, "-" if polarity == "+" else "+")
        if statement in lower:
            return "True"
        if opposite in lower:
            return "False"
        if statement in upper or opposite in upper:
            raise ValueError(f"undefined under the well-founded model: {statement}")
        return "Unknown"
    if semantics == "CWA":
        positive = (subject, predicate, obj, "+")
        if positive in lower:
            holds = True
        elif positive not in upper:
            holds = False
        else:
            raise ValueError(f"undefined under the well-founded model: {statement}")
        return "True" if holds == (polarity == "+") else "False"
    raise ValueError(f"unknown semantics {semantics!r}")


def solve_record_question(semantics: str, record: Dict, question: Dict) -> str:
    facts = [parse_atom(t["representation"]) for t in record["triples"].values()]
    rules = [parse_rule(r["representation"]) for r in record["rules"].values()]
    return solve(semantics, facts, rules, parse_atom(question["representation"]))
