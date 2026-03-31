use anyhow::Result;

/// mSPRT for binary/proportion metrics.
///
/// Returns `(anytime_p_value, e_value)` where:
/// - `e_value` (M_t) accumulates evidence; reject H₀ when M_t ≥ 1/α.
/// - `anytime_p_value = min(1, 1/M_t)` is always valid regardless of when you peek.
///
/// `tau_sq` is the mixing variance for the normal mixture: set to
/// `expected_effect_size²` for a reasonable default.
pub fn msprt_proportion(
    successes_a: usize,
    total_a: usize,
    successes_b: usize,
    total_b: usize,
    tau_sq: f64,
) -> Result<(f64, f64)> {
    if total_a == 0 || total_b == 0 {
        return Ok((1.0, 0.0));
    }
    let n_a = total_a as f64;
    let n_b = total_b as f64;
    let p_hat_a = successes_a as f64 / n_a;
    let p_hat_b = successes_b as f64 / n_b;
    let p_hat_pooled = (successes_a + successes_b) as f64 / (n_a + n_b);

    let sigma_sq = p_hat_pooled * (1.0 - p_hat_pooled) * (1.0 / n_a + 1.0 / n_b);
    if !sigma_sq.is_finite() || sigma_sq <= 0.0 {
        return Ok((1.0, 0.0));
    }

    let z = (p_hat_b - p_hat_a) / sigma_sq.sqrt();
    let denom = sigma_sq + tau_sq;
    let m_t = (sigma_sq / denom).sqrt() * (tau_sq * z * z / (2.0 * denom)).exp();

    if !m_t.is_finite() {
        return Ok((1.0, 0.0));
    }

    let p_value = (1.0_f64).min(1.0 / m_t);
    Ok((p_value, m_t))
}

/// mSPRT for continuous metrics using Welch's SE².
///
/// Returns `(anytime_p_value, e_value)`.
pub fn msprt_continuous(
    mean_a: f64,
    std_a: f64,
    n_a: usize,
    mean_b: f64,
    std_b: f64,
    n_b: usize,
    tau_sq: f64,
) -> Result<(f64, f64)> {
    if n_a == 0 || n_b == 0 {
        return Ok((1.0, 0.0));
    }
    let n_a_f = n_a as f64;
    let n_b_f = n_b as f64;

    let sigma_sq = std_a.powi(2) / n_a_f + std_b.powi(2) / n_b_f;
    if !sigma_sq.is_finite() || sigma_sq <= 0.0 {
        return Ok((1.0, 0.0));
    }

    let z = (mean_b - mean_a) / sigma_sq.sqrt();
    let denom = sigma_sq + tau_sq;
    let m_t = (sigma_sq / denom).sqrt() * (tau_sq * z * z / (2.0 * denom)).exp();

    if !m_t.is_finite() {
        return Ok((1.0, 0.0));
    }

    let p_value = (1.0_f64).min(1.0 / m_t);
    Ok((p_value, m_t))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_null_effect_proportion() {
        // No difference — should yield high p-value and low M_t
        let (p_value, m_t) = msprt_proportion(500, 1000, 500, 1000, 0.01).unwrap();
        assert!(p_value > 0.5, "null effect p-value should be > 0.5, got {p_value}");
        assert!(m_t >= 0.0, "M_t should be non-negative, got {m_t}");
    }

    #[test]
    fn test_strong_effect_proportion() {
        // 10% vs 20% conversion — clear winner
        let (p_value, m_t) = msprt_proportion(100, 1000, 200, 1000, 0.01).unwrap();
        assert!(p_value < 0.05, "strong effect p-value should be < 0.05, got {p_value}");
        assert!(m_t > 20.0, "strong effect M_t should be > 20, got {m_t}");
    }

    #[test]
    fn test_zero_samples() {
        let (p_value, m_t) = msprt_proportion(0, 0, 0, 0, 0.01).unwrap();
        assert_eq!(p_value, 1.0);
        assert_eq!(m_t, 0.0);
    }

    #[test]
    fn test_null_effect_continuous() {
        let (p_value, m_t) = msprt_continuous(10.0, 2.0, 1000, 10.0, 2.0, 1000, 0.01).unwrap();
        assert!(p_value > 0.5, "null continuous p-value should be > 0.5, got {p_value}");
        assert!(m_t >= 0.0);
    }

    #[test]
    fn test_strong_effect_continuous() {
        let (p_value, m_t) = msprt_continuous(10.0, 1.0, 1000, 11.0, 1.0, 1000, 0.25).unwrap();
        assert!(p_value < 0.05, "strong continuous p-value should be < 0.05, got {p_value}");
        assert!(m_t > 20.0, "strong continuous M_t should be > 20, got {m_t}");
    }
}
