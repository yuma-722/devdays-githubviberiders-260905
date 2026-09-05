using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Moq;

namespace Survey.Tests;

internal static class TestData
{
    internal static Dictionary<string, object?> Input() => new()
    {
        ["communityAffiliation"] = Array.Empty<string>(),
        ["jobRole"] = new[] { SurveyOptions.JobRoles[0] },
        ["eventRating"] = 5
    };

    internal static string Json(Dictionary<string, object?>? input = null) =>
        JsonSerializer.Serialize(input ?? Input(), SurveyJson.Options);

    internal static MemoryStream Stream(string json) => new(Encoding.UTF8.GetBytes(json));

    internal static SurveyDocument Document(int rating = 5, string? feedback = null) =>
        SurveyDocument.Create(new SurveyInput([], [SurveyOptions.JobRoles[0]], null, rating, feedback),
            new FixedClock());
}

internal sealed class FixedClock : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => new(2026, 9, 5, 23, 59, 59, TimeSpan.Zero);
}

internal sealed class TestHttpRequest(string body = "") : HttpRequestData(Mock.Of<FunctionContext>())
{
    public override Stream Body { get; } = TestData.Stream(body);
    public override HttpHeadersCollection Headers { get; } = new();
    public override IReadOnlyCollection<IHttpCookie> Cookies { get; } = [];
    public override Uri Url { get; } = new("http://localhost/api/surveys");
    public override IEnumerable<ClaimsIdentity> Identities { get; } = [];
    public override string Method => "POST";
    public override HttpResponseData CreateResponse() => new TestHttpResponse(FunctionContext);
}

internal sealed class TestHttpResponse(FunctionContext context) : HttpResponseData(context)
{
    public override HttpStatusCode StatusCode { get; set; }
    public override HttpHeadersCollection Headers { get; set; } = new();
    public override Stream Body { get; set; } = new MemoryStream();
    public override HttpCookies Cookies { get; } = Mock.Of<HttpCookies>();
}
