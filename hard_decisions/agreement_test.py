from hard_decisions import agreement


def test_perfect_and_prevalence_paradox():
    same = [("true", "true"), ("false", "false")] * 10
    assert agreement.coefficients(same, ["true", "false"]) == {"agreement": 1.0, "kappa": 1.0, "ac1": 1.0}
    skewed = [("false", "false")] * 94 + [("true", "true")] * 3 + [("false", "true")] * 2 + [("true", "false")]
    c = agreement.coefficients(skewed, ["true", "false"])
    assert round(c["agreement"], 2) == 0.97 and c["kappa"] < 0.7 < 0.95 < c["ac1"]


def test_repeated_invalid_counts_as_agreement():
    c = agreement.coefficients([(None, None), ("true", "true"), ("true", "false")], ["true", "false"])
    assert round(c["agreement"], 3) == 0.667


def test_bootstrap_interval_brackets_point():
    pairs = [("true", "true")] * 90 + [("true", "false")] * 10
    low, high = agreement.bootstrap_ac1(pairs, ["true", "false"])
    assert low <= agreement.coefficients(pairs, ["true", "false"])["ac1"] <= high
