// Author: yunnuo <ymz@ebox.vip>
// Description: Click-through human verification adapters: Cloudflare Turnstile, Tencent TCaptcha and Aliyun captcha 2.0.
package humancheck

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	captcha "github.com/alibabacloud-go/captcha-20230305/client"
	openapiutil "github.com/alibabacloud-go/darabonba-openapi/v2/utils"
	tcaptcha "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/captcha/v20190722"
	tcommon "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common"
	tprofile "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/profile"

	"github.com/yunnuo/unicore/internal/platform"
)

// Verifier implements platform.HumanCheckPort against the configured provider.
// Endpoints are real cloud services; tests replace them through the client hooks.
type Verifier struct {
	// HTTPClient posts the Turnstile siteverify call; nil uses a 10s client.
	HTTPClient *http.Client
	// SiteVerifyURL, TencentEndpoint and AliyunEndpoint override the provider endpoints for tests.
	SiteVerifyURL   string
	TencentEndpoint string
	AliyunEndpoint  string
}

const defaultTurnstileSiteVerify = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

func (v Verifier) Verify(ctx context.Context, config platform.HumanCheckConfig, token, randstr, ip string) error {
	switch config.Provider {
	case "turnstile":
		return v.verifyTurnstile(ctx, config, token, ip)
	case "tencent":
		return v.verifyTencent(config, token, randstr, ip)
	case "alibaba":
		return v.verifyAliyun(config, token)
	default:
		return platform.ErrHumanCheckConfig
	}
}

type turnstileResult struct {
	Success bool `json:"success"`
}

func (v Verifier) verifyTurnstile(ctx context.Context, config platform.HumanCheckConfig, token, ip string) error {
	client := v.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	target := v.SiteVerifyURL
	if target == "" {
		target = defaultTurnstileSiteVerify
	}
	form := url.Values{"secret": {config.TurnstileSecretKey}, "response": {token}}
	if ip != "" {
		form.Set("remoteip", ip)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, target, strings.NewReader(form.Encode()))
	if err != nil {
		return platform.ErrHumanCheck
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := client.Do(request)
	if err != nil {
		return platform.ErrHumanCheck
	}
	defer response.Body.Close()
	var result turnstileResult
	if err = json.NewDecoder(response.Body).Decode(&result); err != nil {
		return platform.ErrHumanCheck
	}
	if response.StatusCode != http.StatusOK || !result.Success {
		return platform.ErrHumanCheck
	}
	return nil
}

func (v Verifier) verifyTencent(config platform.HumanCheckConfig, ticket, randstr, ip string) error {
	endpoint := v.TencentEndpoint
	if endpoint == "" {
		if config.TencentRegion == "intl" {
			endpoint = "captcha.intl.tencentcloudapi.com"
		} else {
			endpoint = "captcha.tencentcloudapi.com"
		}
	}
	profile := tprofile.NewClientProfile()
	profile.HttpProfile.Endpoint = endpoint
	client, err := tcaptcha.NewClient(tcommon.NewCredential(config.TencentSecretID, config.TencentSecretKey), "", profile)
	if err != nil {
		return platform.ErrHumanCheck
	}
	appID, err := strconv.ParseUint(config.TencentAppID, 10, 64)
	if err != nil {
		return platform.ErrHumanCheckConfig
	}
	request := tcaptcha.NewDescribeCaptchaResultRequest()
	request.CaptchaType = tcommon.Uint64Ptr(9)
	request.Ticket = tcommon.StringPtr(ticket)
	request.Randstr = tcommon.StringPtr(randstr)
	request.UserIp = tcommon.StringPtr(ip)
	request.CaptchaAppId = tcommon.Uint64Ptr(appID)
	request.AppSecretKey = tcommon.StringPtr(config.TencentAppSecretKey)
	response, err := client.DescribeCaptchaResult(request)
	if err != nil {
		return platform.ErrHumanCheck
	}
	if response == nil || response.Response == nil || response.Response.CaptchaCode == nil || *response.Response.CaptchaCode != 1 {
		return platform.ErrHumanCheck
	}
	return nil
}

func (v Verifier) verifyAliyun(config platform.HumanCheckConfig, verifyParam string) error {
	endpoint := v.AliyunEndpoint
	if endpoint == "" {
		if config.AliyunRegion == "ap-southeast-1" {
			endpoint = "captcha.ap-southeast-1.aliyuncs.com"
		} else {
			endpoint = "captcha.cn-shanghai.aliyuncs.com"
		}
	}
	client, err := captcha.NewClient(&openapiutil.Config{
		AccessKeyId:     strPtr(config.AliyunAccessKeyID),
		AccessKeySecret: strPtr(config.AliyunAccessKeySecret),
		Endpoint:        strPtr(endpoint),
	})
	if err != nil {
		return platform.ErrHumanCheck
	}
	request := &captcha.VerifyIntelligentCaptchaRequest{
		CaptchaVerifyParam: strPtr(verifyParam),
		SceneId:            strPtr(config.AliyunSceneID),
	}
	response, err := client.VerifyIntelligentCaptcha(request)
	if err != nil {
		return platform.ErrHumanCheck
	}
	if response == nil || response.Body == nil || response.Body.Result == nil || response.Body.Result.VerifyResult == nil || !*response.Body.Result.VerifyResult {
		return platform.ErrHumanCheck
	}
	return nil
}

func strPtr(value string) *string { return &value }
