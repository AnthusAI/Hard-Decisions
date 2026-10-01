import pytest

from hard_decisions.solver import parse_atom, parse_rule, solve


def atom(s, p, o, pol="+"):
    return (s, p, o, pol)


def rule(text):
    return parse_rule(text)


CHAIN = [rule('((("someone" "is" "kind" "+")) -> ("someone" "is" "nice" "+"))'),
         rule('((("someone" "is" "nice" "+") ("someone" "is" "young" "+")) -> ("someone" "is" "smart" "+"))')]
FACTS = [atom("Anne", "is", "kind"), atom("Anne", "is", "young"), atom("Bob", "is", "kind")]


def test_parse_atom_and_rule():
    assert parse_atom('("Erin" "is" "cold" "+")') == ("Erin", "is", "cold", "+")
    r = rule('((("something" "is" "cold" "+") ("something" "is" "green" "~")) -> ("something" "is" "round" "+"))')
    assert r.body[1][3] == "~" and r.head == ("something", "is", "round", "+")


def test_owa_true_false_unknown():
    facts = FACTS + [atom("Bob", "is", "smart", "-")]
    assert solve("OWA", facts, CHAIN, atom("Anne", "is", "smart")) == "True"
    assert solve("OWA", facts, CHAIN, atom("Bob", "is", "smart")) == "False"
    assert solve("OWA", FACTS, CHAIN, atom("Bob", "is", "smart")) == "Unknown"
    assert solve("OWA", FACTS, CHAIN, atom("Bob", "is", "smart", "-")) == "Unknown"


def test_cwa_negation_as_failure_in_statement():
    assert solve("CWA", FACTS, CHAIN, atom("Bob", "is", "smart")) == "False"
    assert solve("CWA", FACTS, CHAIN, atom("Bob", "is", "smart", "-")) == "True"
    assert solve("CWA", FACTS, CHAIN, atom("Anne", "is", "smart", "-")) == "False"


NOT_GREEN = [rule('((("something" "is" "cold" "+") ("something" "is" "green" "~")) -> ("something" "is" "round" "+"))')]


def test_tilde_is_naf_under_cwa_and_explicit_negation_under_owa():
    facts = [atom("Fiona", "is", "cold")]
    assert solve("CWA", facts, NOT_GREEN, atom("Fiona", "is", "round")) == "True"
    assert solve("OWA", facts, NOT_GREEN, atom("Fiona", "is", "round")) == "Unknown"
    assert solve("OWA", facts + [atom("Fiona", "is", "green", "-")], NOT_GREEN,
                 atom("Fiona", "is", "round")) == "True"


def test_cwa_naf_respects_derived_atoms():
    rules = NOT_GREEN + [rule('((("someone" "is" "cold" "+")) -> ("someone" "is" "green" "+"))')]
    assert solve("CWA", [atom("Fiona", "is", "cold")], rules, atom("Fiona", "is", "round")) == "False"


def test_relation_rule_with_constant_object_and_variable_subject():
    rules = [rule('((("someone" "likes" "cat" "+")) -> ("cat" "is" "green" "+"))')]
    assert solve("OWA", [atom("dog", "likes", "cat")], rules, atom("cat", "is", "green")) == "True"
    assert solve("OWA", [atom("dog", "eats", "cat")], rules, atom("cat", "is", "green")) == "Unknown"
