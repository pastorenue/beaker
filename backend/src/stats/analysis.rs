use anyhow::Result;
use statrs::distribution::{ContinuousCDF, Normal, StudentsT};
use statrs::statistics::Statistics;

use crate::models::AnalysisEngine;
use super::sequential;

pub struct EngineResult {
    pub effect_size: f64,
    pub p_value: f64,
    pub bayes_probability: Option<f64>,
    pub e_value: Option<f64>,
    pub sequential_threshold: Option<f64>,
    pub ci_low: f64,
    pub ci_high: f64,
    pub test_type: String,
}

impl EngineResult {
    pub fn is_significant(&self, alpha: f64) -> bool {
        if let Some(e_val) = self.e_value {
            e_val >= (1.0 / alpha)
        } else if let Some(prob) = self.bayes_probability {
            prob >= (1.0 - alpha)
        } else {
            self.p_value < alpha
        }
    }
}

/// Calculate z-test for proportions (conversion rates)
pub fn z_test_proportions(
    successes_a: usize,
    total_a: usize,
    successes_b: usize,
    total_b: usize,
) -> Result<(f64, f64, f64, f64)> {
    if total_a == 0 || total_b == 0 {
        return Ok((0.0, 1.0, 0.0, 0.0));
    }
    let p1 = successes_a as f64 / total_a as f64;
    let p2 = successes_b as f64 / total_b as f64;

    let p_pooled = (successes_a + successes_b) as f64 / (total_a + total_b) as f64;
    let se = (p_pooled * (1.0 - p_pooled) * (1.0 / total_a as f64 + 1.0 / total_b as f64)).sqrt();
    if !se.is_finite() || se <= 0.0 {
        let effect_size = p1 - p2;
        return Ok((effect_size, 1.0, effect_size, effect_size));
    }

    let z = (p1 - p2) / se;
    let normal = Normal::new(0.0, 1.0)?;
    let p_value = 2.0 * (1.0 - normal.cdf(z.abs()));

    let effect_size = p1 - p2;
    let ci_margin = 1.96 * se; // 95% CI

    Ok((
        effect_size,
        p_value,
        effect_size - ci_margin,
        effect_size + ci_margin,
    ))
}

/// Calculate two-sample t-test for continuous metrics
pub fn t_test_two_sample(values_a: &[f64], values_b: &[f64]) -> Result<(f64, f64, f64, f64)> {
    if values_a.len() < 2 || values_b.len() < 2 {
        return Ok((0.0, 1.0, 0.0, 0.0));
    }
    let mean_a = values_a.mean();
    let mean_b = values_b.mean();
    let var_a = values_a.variance();
    let var_b = values_b.variance();
    let n_a = values_a.len() as f64;
    let n_b = values_b.len() as f64;

    // Welch's t-test (unequal variances)
    let se = (var_a / n_a + var_b / n_b).sqrt();
    if !se.is_finite() || se <= 0.0 {
        let effect_size = mean_a - mean_b;
        return Ok((effect_size, 1.0, effect_size, effect_size));
    }
    let t_stat = (mean_a - mean_b) / se;

    // Welch-Satterthwaite degrees of freedom
    let df = (var_a / n_a + var_b / n_b).powi(2)
        / ((var_a / n_a).powi(2) / (n_a - 1.0) + (var_b / n_b).powi(2) / (n_b - 1.0));
    if !df.is_finite() || df <= 0.0 {
        let effect_size = mean_a - mean_b;
        return Ok((effect_size, 1.0, effect_size, effect_size));
    }

    let students_t = StudentsT::new(0.0, 1.0, df)?;
    let p_value = 2.0 * (1.0 - students_t.cdf(t_stat.abs()));

    let effect_size = mean_a - mean_b;
    let ci_margin = students_t.inverse_cdf(0.975) * se;

    Ok((
        effect_size,
        p_value,
        effect_size - ci_margin,
        effect_size + ci_margin,
    ))
}

/// Calculate two-sample t-test from summary stats (mean, std dev, n)
pub fn t_test_summary(
    mean_a: f64,
    std_a: f64,
    n_a: usize,
    mean_b: f64,
    std_b: f64,
    n_b: usize,
) -> Result<(f64, f64, f64, f64)> {
    if n_a < 2 || n_b < 2 {
        let effect_size = mean_a - mean_b;
        return Ok((effect_size, 1.0, effect_size, effect_size));
    }
    let n_a = n_a as f64;
    let n_b = n_b as f64;

    let var_a = std_a.powi(2);
    let var_b = std_b.powi(2);
    let se = (var_a / n_a + var_b / n_b).sqrt();
    if !se.is_finite() || se <= 0.0 {
        let effect_size = mean_a - mean_b;
        return Ok((effect_size, 1.0, effect_size, effect_size));
    }
    let t_stat = (mean_a - mean_b) / se;

    let df = (var_a / n_a + var_b / n_b).powi(2)
        / ((var_a / n_a).powi(2) / (n_a - 1.0) + (var_b / n_b).powi(2) / (n_b - 1.0));
    if !df.is_finite() || df <= 0.0 {
        let effect_size = mean_a - mean_b;
        return Ok((effect_size, 1.0, effect_size, effect_size));
    }

    let students_t = StudentsT::new(0.0, 1.0, df)?;
    let p_value = 2.0 * (1.0 - students_t.cdf(t_stat.abs()));
    let effect_size = mean_a - mean_b;
    let ci_margin = students_t.inverse_cdf(0.975) * se;

    Ok((
        effect_size,
        p_value,
        effect_size - ci_margin,
        effect_size + ci_margin,
    ))
}

/// Calculate required sample size for proportion test
pub fn sample_size_proportion(
    baseline_conversion: f64,
    mde: f64, // Minimum detectable effect
    alpha: f64,
    power: f64,
) -> usize {
    let normal = Normal::new(0.0, 1.0).unwrap();
    let z_alpha = normal.inverse_cdf(1.0 - alpha / 2.0); // Two-tailed
    let z_beta = normal.inverse_cdf(power);

    let p1 = baseline_conversion;
    let p2 = baseline_conversion + mde;
    let p_avg = (p1 + p2) / 2.0;

    let numerator = (z_alpha * (2.0 * p_avg * (1.0 - p_avg)).sqrt()
        + z_beta * (p1 * (1.0 - p1) + p2 * (1.0 - p2)).sqrt())
    .powi(2);
    let denominator = (p2 - p1).powi(2);

    (numerator / denominator).ceil() as usize
}

/// Calculate required sample size for continuous metric
pub fn sample_size_continuous(std_dev: f64, mde: f64, alpha: f64, power: f64) -> usize {
    let normal = Normal::new(0.0, 1.0).unwrap();
    let z_alpha = normal.inverse_cdf(1.0 - alpha / 2.0); // Two-tailed
    let z_beta = normal.inverse_cdf(power);

    let n = (2.0 * std_dev.powi(2) * (z_alpha + z_beta).powi(2)) / mde.powi(2);
    n.ceil() as usize
}

/// Calculate Cohen's d effect size
pub fn cohens_d(mean_a: f64, mean_b: f64, std_pooled: f64) -> f64 {
    (mean_a - mean_b) / std_pooled
}

pub fn analyze_proportion(
    engine: AnalysisEngine,
    successes_a: usize,
    total_a: usize,
    successes_b: usize,
    total_b: usize,
    tau_sq: f64,
    alpha: f64,
) -> Result<EngineResult> {
    match engine {
        AnalysisEngine::Bayesian => {
            let (effect_size, probability, ci_low, ci_high) =
                bayes_proportion(successes_a, total_a, successes_b, total_b)?;
            Ok(EngineResult {
                effect_size,
                p_value: 1.0 - probability,
                bayes_probability: Some(probability),
                e_value: None,
                sequential_threshold: None,
                ci_low,
                ci_high,
                test_type: "Bayesian (Beta-Binomial)".to_string(),
            })
        }
        AnalysisEngine::Frequentist => {
            let (effect_size, p_value, ci_low, ci_high) =
                z_test_proportions(successes_a, total_a, successes_b, total_b)?;
            Ok(EngineResult {
                effect_size,
                p_value,
                bayes_probability: None,
                e_value: None,
                sequential_threshold: None,
                ci_low,
                ci_high,
                test_type: "Z-test for proportions".to_string(),
            })
        }
        AnalysisEngine::Sequential => {
            let (effect_size, _, ci_low, ci_high) =
                z_test_proportions(successes_a, total_a, successes_b, total_b)?;
            let (p_value, e_value) =
                sequential::msprt_proportion(successes_a, total_a, successes_b, total_b, tau_sq)?;
            Ok(EngineResult {
                effect_size,
                p_value,
                bayes_probability: None,
                e_value: Some(e_value),
                sequential_threshold: Some(1.0 / alpha),
                ci_low,
                ci_high,
                test_type: "mSPRT (Sequential)".to_string(),
            })
        }
    }
}

pub fn analyze_continuous(
    engine: AnalysisEngine,
    mean_a: f64,
    std_a: f64,
    n_a: usize,
    mean_b: f64,
    std_b: f64,
    n_b: usize,
    tau_sq: f64,
    alpha: f64,
) -> Result<EngineResult> {
    match engine {
        AnalysisEngine::Bayesian => {
            let (effect_size, probability, ci_low, ci_high) =
                bayes_continuous(mean_a, std_a, n_a, mean_b, std_b, n_b)?;
            Ok(EngineResult {
                effect_size,
                p_value: 1.0 - probability,
                bayes_probability: Some(probability),
                e_value: None,
                sequential_threshold: None,
                ci_low,
                ci_high,
                test_type: "Bayesian (Normal Approx)".to_string(),
            })
        }
        AnalysisEngine::Frequentist => {
            let (effect_size, p_value, ci_low, ci_high) =
                t_test_summary(mean_a, std_a, n_a, mean_b, std_b, n_b)?;
            Ok(EngineResult {
                effect_size,
                p_value,
                bayes_probability: None,
                e_value: None,
                sequential_threshold: None,
                ci_low,
                ci_high,
                test_type: "Welch's t-test".to_string(),
            })
        }
        AnalysisEngine::Sequential => {
            let (effect_size, _, ci_low, ci_high) =
                t_test_summary(mean_a, std_a, n_a, mean_b, std_b, n_b)?;
            let (p_value, e_value) =
                sequential::msprt_continuous(mean_a, std_a, n_a, mean_b, std_b, n_b, tau_sq)?;
            Ok(EngineResult {
                effect_size,
                p_value,
                bayes_probability: None,
                e_value: Some(e_value),
                sequential_threshold: Some(1.0 / alpha),
                ci_low,
                ci_high,
                test_type: "mSPRT (Sequential)".to_string(),
            })
        }
    }
}

fn bayes_proportion(
    successes_a: usize,
    total_a: usize,
    successes_b: usize,
    total_b: usize,
) -> Result<(f64, f64, f64, f64)> {
    let failures_a = total_a.saturating_sub(successes_a) as f64;
    let failures_b = total_b.saturating_sub(successes_b) as f64;
    let alpha_a = 1.0 + successes_a as f64;
    let beta_a = 1.0 + failures_a;
    let alpha_b = 1.0 + successes_b as f64;
    let beta_b = 1.0 + failures_b;

    let mean_a = alpha_a / (alpha_a + beta_a);
    let mean_b = alpha_b / (alpha_b + beta_b);
    let var_a = (alpha_a * beta_a)
        / ((alpha_a + beta_a).powi(2) * (alpha_a + beta_a + 1.0));
    let var_b = (alpha_b * beta_b)
        / ((alpha_b + beta_b).powi(2) * (alpha_b + beta_b + 1.0));

    let diff_mean = mean_b - mean_a;
    let diff_var = var_a + var_b;
    let diff_se = diff_var.sqrt().max(1e-9);

    let normal = Normal::new(0.0, 1.0)?;
    let z = diff_mean / diff_se;
    let probability = normal.cdf(z);
    let ci_margin = 1.96 * diff_se;

    Ok((
        diff_mean,
        probability,
        diff_mean - ci_margin,
        diff_mean + ci_margin,
    ))
}

fn bayes_continuous(
    mean_a: f64,
    std_a: f64,
    n_a: usize,
    mean_b: f64,
    std_b: f64,
    n_b: usize,
) -> Result<(f64, f64, f64, f64)> {
    let n_a = n_a as f64;
    let n_b = n_b as f64;
    let se = (std_a.powi(2) / n_a + std_b.powi(2) / n_b).sqrt().max(1e-9);
    let diff_mean = mean_b - mean_a;

    let normal = Normal::new(0.0, 1.0)?;
    let z = diff_mean / se;
    let probability = normal.cdf(z);
    let ci_margin = 1.96 * se;

    Ok((
        diff_mean,
        probability,
        diff_mean - ci_margin,
        diff_mean + ci_margin,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_z_test_proportions() {
        let result = z_test_proportions(100, 1000, 120, 1000);
        assert!(result.is_ok());
        let (effect, p_value, ci_low, ci_high) = result.unwrap();
        assert!(effect < 0.0); // A is worse than B
        assert!(p_value > 0.05); // Not significant
    }

    #[test]
    fn test_sample_size_proportion() {
        let n = sample_size_proportion(0.10, 0.02, 0.05, 0.8);
        assert!(n > 0);
        assert!(n < 10000); // Sanity check
    }

    #[test]
    fn test_cohens_d() {
        let d = cohens_d(10.0, 8.0, 2.0);
        assert!((d - 1.0).abs() < 0.01);
    }
}
