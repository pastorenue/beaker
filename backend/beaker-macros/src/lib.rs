use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::{format_ident, quote};
use syn::{
    parse_macro_input, parse_quote, FnArg, Ident, ItemFn, LitInt, LitStr, Pat, PatIdent, PatType,
    Token,
};

// --- Argument parsers ---

struct RateLimitArgs {
    group: String,
}

impl syn::parse::Parse for RateLimitArgs {
    fn parse(input: syn::parse::ParseStream) -> syn::Result<Self> {
        let _ident: Ident = input.parse()?;
        let _: Token![=] = input.parse()?;
        let lit: LitStr = input.parse()?;
        Ok(RateLimitArgs { group: lit.value() })
    }
}

struct CircuitBreakerArgs {
    failure_threshold: u32,
    recovery_timeout: u64,
}

impl syn::parse::Parse for CircuitBreakerArgs {
    fn parse(input: syn::parse::ParseStream) -> syn::Result<Self> {
        let mut failure_threshold = 10u32;
        let mut recovery_timeout = 30u64;

        while !input.is_empty() {
            let ident: Ident = input.parse()?;
            let _: Token![=] = input.parse()?;
            let val: LitInt = input.parse()?;

            match ident.to_string().as_str() {
                "failure_threshold" => failure_threshold = val.base10_parse()?,
                "recovery_timeout" => recovery_timeout = val.base10_parse()?,
                _ => return Err(syn::Error::new(ident.span(), "unknown argument")),
            }

            if !input.is_empty() {
                let _: Token![,] = input.parse()?;
            }
        }

        Ok(CircuitBreakerArgs {
            failure_threshold,
            recovery_timeout,
        })
    }
}

// --- Helpers ---

/// Return the ident of an existing `HttpRequest` parameter, if any.
fn find_http_request_param(func: &ItemFn) -> Option<Ident> {
    for arg in &func.sig.inputs {
        if let FnArg::Typed(PatType { pat, ty, .. }) = arg {
            let type_str = quote! { #ty }.to_string();
            if type_str.contains("HttpRequest") {
                if let Pat::Ident(PatIdent { ident, .. }) = pat.as_ref() {
                    return Some(ident.clone());
                }
            }
        }
    }
    None
}

/// Extract each parameter name as a token to pass in a function call.
fn extract_call_args(func: &ItemFn) -> Vec<TokenStream2> {
    func.sig
        .inputs
        .iter()
        .filter_map(|arg| match arg {
            FnArg::Typed(PatType { pat, .. }) => match pat.as_ref() {
                Pat::Ident(PatIdent { ident, .. }) => Some(quote! { #ident }),
                _ => None,
            },
            FnArg::Receiver(_) => None,
        })
        .collect()
}

// --- #[rate_limit(group = "...")] ---
//
// Stacking order: when placed *above* #[circuit_breaker], rate limiting is checked
// first.  The macro achieves this by:
//  1. Renaming the original function to `__inner_<name>`, keeping all its other
//     attributes (including any #[circuit_breaker] that will be processed next).
//  2. Emitting a new outer `<name>` function that does the rate-limit check and
//     then calls `__inner_<name>`.

#[proc_macro_attribute]
pub fn rate_limit(attr: TokenStream, item: TokenStream) -> TokenStream {
    let args = parse_macro_input!(attr as RateLimitArgs);
    let func = parse_macro_input!(item as ItemFn);

    let group = &args.group;
    let fn_name = &func.sig.ident;
    let inner_name = format_ident!("__inner_{}", fn_name);
    let vis = &func.vis;
    let asyncness = &func.sig.asyncness;
    let inner_inputs = &func.sig.inputs;
    let inner_body = &func.block;
    // All original attributes (e.g. #[circuit_breaker]) go on the inner fn so
    // the compiler processes them after this expansion.
    let fwd_attrs = &func.attrs;

    // Arguments to forward to the inner call (same names, same order).
    let call_args = extract_call_args(&func);

    // Build outer params as a Vec<FnArg> to avoid trailing-comma / leading-comma
    // issues that arise when concatenating a Punctuated list with extra tokens.
    let (req_ident, outer_params): (Ident, Vec<syn::FnArg>) = {
        let mut params: Vec<syn::FnArg> = func.sig.inputs.iter().cloned().collect();
        match find_http_request_param(&func) {
            Some(existing) => (existing, params),
            None => {
                let ident = format_ident!("__rl_req");
                let extra: syn::FnArg = parse_quote! { __rl_req: actix_web::HttpRequest };
                params.push(extra);
                (ident, params)
            }
        }
    };

    quote! {
        // Inner function – carries the remaining attributes (e.g. #[circuit_breaker]).
        #(#fwd_attrs)*
        #asyncness fn #inner_name(#inner_inputs) -> actix_web::HttpResponse
        #inner_body

        // Outer wrapper – rate-limit gate, then delegate.
        #vis #asyncness fn #fn_name(#(#outer_params),*) -> actix_web::HttpResponse {
            {
                let __rl_ip = #req_ident
                    .peer_addr()
                    .map(|a| a.ip().to_string())
                    .unwrap_or_else(|| "unknown".to_string());
                if !crate::middleware::rate_limit::check(#group, &__rl_ip) {
                    return actix_web::HttpResponse::TooManyRequests()
                        .json(::serde_json::json!({"error": "Rate limit exceeded"}));
                }
            }
            #inner_name(#(#call_args),*).await
        }
    }
    .into()
}

// --- #[circuit_breaker(failure_threshold = N, recovery_timeout = N)] ---
//
// Wraps the handler body so that:
//   • When the breaker is Open (cooldown active) → 503 without executing the body.
//   • When the breaker is HalfOpen → one probe request is let through.
//   • After the body runs, records success/failure based on the HTTP status code.
//
// Note: explicit `return` statements inside the body escape the surrounding block
// directly, so CB recording is not performed on early returns (typically 401/403/
// 400 responses that do not indicate a backend failure).

#[proc_macro_attribute]
pub fn circuit_breaker(attr: TokenStream, item: TokenStream) -> TokenStream {
    let args = parse_macro_input!(attr as CircuitBreakerArgs);
    let mut func = parse_macro_input!(item as ItemFn);

    let failure_threshold = args.failure_threshold;
    let recovery_timeout = args.recovery_timeout;
    let fn_name_str = func.sig.ident.to_string();

    // Ensure return type is HttpResponse.
    func.sig.output = parse_quote!(-> actix_web::HttpResponse);

    let original_stmts = func.block.stmts.clone();

    let new_block_tokens = quote! {
        {
            let __cb_key = concat!(module_path!(), "::", #fn_name_str);
            let __cb = crate::middleware::circuit_breaker::get_or_create(
                __cb_key,
                #failure_threshold as u32,
                #recovery_timeout as u64,
            );
            if !__cb.should_allow().await {
                return actix_web::HttpResponse::ServiceUnavailable()
                    .json(::serde_json::json!({"error": "Service temporarily unavailable"}));
            }
            let __cb_resp: actix_web::HttpResponse = {
                #(#original_stmts)*
            };
            if __cb_resp.status().is_server_error() {
                __cb.record_failure().await;
            } else {
                __cb.record_success().await;
            }
            __cb_resp
        }
    };

    let new_block: syn::Block =
        syn::parse2(new_block_tokens).expect("circuit_breaker: failed to parse generated block");
    *func.block = new_block;

    TokenStream::from(quote! { #func })
}
