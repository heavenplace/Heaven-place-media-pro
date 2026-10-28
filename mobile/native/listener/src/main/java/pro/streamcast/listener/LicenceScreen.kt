package pro.streamcast.listener

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import pro.streamcast.core.Api
import pro.streamcast.core.Brand
import pro.streamcast.core.Chip
import pro.streamcast.core.LicenceApplication
import pro.streamcast.core.Line
import pro.streamcast.core.Message
import pro.streamcast.core.Notice
import pro.streamcast.core.Pill
import pro.streamcast.core.PrimaryButton
import pro.streamcast.core.SectionTitle
import pro.streamcast.core.TextInput
import pro.streamcast.core.licenceOf
import pro.streamcast.core.objects
import pro.streamcast.core.remote
import pro.streamcast.core.stampLabel

private val COVERAGES = listOf("fm" to "FM only", "fm_tv" to "FM + TV")
private val PLANS = listOf("standard" to "Standard", "premium" to "Premium")

// Any PrcPay currency is accepted except PRCP, PrcPay's own token. The short list is only a
// convenience — the field takes any other code too.
private val CURRENCIES = listOf("USD", "EUR", "GBP", "NGN", "GHS", "KES", "ZAR", "INR", "USDT", "USDC", "BTC")

/** The licence is billed in dollars, whatever PrcPay currency the fee is paid in. */
private fun licenceMoney(cents: Int): String = "$" + String.format("%.2f", cents / 100.0)

/**
 * Opening a station from the phone: the same licence the web's /apply page sells, against
 * the same API. Applying records the application (`POST /applications`); paying with PrcPay
 * charges the applicant's own PrcPay account server-side and settles inside the request, so
 * the fee is paid and verified the moment the pay button returns and the control room can
 * open the station straight away (`POST /api/prcpay/checkout`, `kind = "licence"`).
 */
@Composable
fun LicenceScreen() {
    val applications = remote("licence-applications") {
        Api.get("/applications/mine").objects("applications").map { licenceOf(it) }
    }
    val config = remote("licence-config") { Api.get("/config") }
    val scope = rememberCoroutineScope()

    val fees = config.data?.optJSONObject("station_fees")
    val standardFee = fees?.optInt("standard")?.takeIf { it > 0 } ?: 500
    val premiumFee = fees?.optInt("premium")?.takeIf { it > 0 } ?: 1500
    val prcpayOn = config.data?.optBoolean("prcpay_enabled") ?: false

    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var coverage by remember { mutableStateOf("fm") }
    var plan by remember { mutableStateOf("standard") }
    var paying by remember { mutableStateOf<Int?>(null) }
    var account by remember { mutableStateOf("") }
    var currency by remember { mutableStateOf("USD") }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    val feeOf: (String) -> Int = { chosen -> if (chosen == "premium") premiumFee else standardFee }

    fun apply() {
        if (name.trim().isBlank()) {
            error = "Give the station a name"
            notice = null
            return
        }
        scope.launch {
            busy = true
            error = null
            try {
                Api.post(
                    "/applications",
                    JSONObject()
                        .put("station_name", name.trim())
                        .put("description", description.trim())
                        .put("coverage", coverage)
                        .put("plan", plan)
                )
                name = ""
                description = ""
                notice = "Application received — pay the licence fee below and the control room opens your station."
                applications.reload()
            } catch (failure: Exception) {
                error = failure.message ?: "That application could not be saved"
            } finally {
                busy = false
            }
        }
    }

    fun pay(application: LicenceApplication) {
        val payer = account.trim()
        if (payer.isBlank()) {
            error = "Add the PrcPay account the fee should move from"
            return
        }
        scope.launch {
            busy = true
            error = null
            try {
                val data = Api.post(
                    "/prcpay/checkout",
                    JSONObject()
                        .put("kind", "licence")
                        .put("application_id", application.id)
                        .put("account", payer)
                        .put("currency", currency.trim().uppercase())
                )
                notice = data.optString("message").takeIf { it.isNotBlank() } ?: "Licence paid."
                paying = null
                applications.reload()
            } catch (failure: Exception) {
                error = failure.message ?: "That payment did not go through"
            } finally {
                busy = false
            }
        }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Open a station") }
        item {
            Text(
                "Apply for an FM station, or FM plus its TV twin. The licence is " +
                    "${licenceMoney(standardFee)} on the standard plan and ${licenceMoney(premiumFee)} on premium; " +
                    "the control room opens your station once the fee is paid. Only the premium plan may publish " +
                    "premium and paid content, and its owner collects what listeners pay for it.",
                color = Brand.muted,
                fontSize = 12.sp
            )
        }
        item {
            Column(
                Modifier.fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(12.dp))
                    .background(Brand.panel).padding(12.dp)
            ) {
                Text("Apply for a licence", color = Brand.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                TextInput(name, { name = it }, "Station name")
                TextInput(description, { description = it }, "What will you broadcast?", singleLine = false)
                Text("Coverage", color = Brand.muted, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
                Row(
                    Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    COVERAGES.forEach { (id, label) -> Chip(label, coverage == id) { coverage = id } }
                }
                Text("Licence", color = Brand.muted, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
                Row(
                    Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    PLANS.forEach { (id, label) ->
                        Chip("$label — ${licenceMoney(feeOf(id))} one-off", plan == id) { plan = id }
                    }
                }
                Spacer(Modifier.height(10.dp))
                PrimaryButton(if (busy) "Sending…" else "Submit application", enabled = !busy) { apply() }
            }
        }

        notice?.let { text -> item { Notice(text, Brand.ok) } }
        error?.let { text -> item { Notice(text, Brand.live) } }

        item { SectionTitle("Your applications") }
        val list = applications.data.orEmpty()
        if (list.isEmpty()) {
            item {
                Message(
                    applications.error
                        ?: if (applications.loading) "Loading applications…" else "No applications yet."
                )
            }
        }
        items(list, key = { "licence-${it.id}" }) { application ->
            Column(
                Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(12.dp))
                    .background(Brand.panel).padding(12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        application.stationName,
                        color = Brand.text,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    Pill(
                        if (application.feePaid) "fee paid" else "fee unpaid",
                        if (application.feePaid) Brand.ok else Brand.muted
                    )
                }
                Row(
                    Modifier.padding(top = 4.dp).horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Pill(application.coverageLabel)
                    Pill("${application.planLabel} plan")
                    Pill(licenceMoney(application.feeCents))
                    Pill(
                        "application ${application.status}",
                        if (application.status == "approved") Brand.ok else Brand.muted
                    )
                }
                stampLabel(application.createdAt)?.let {
                    Text("Applied $it", color = Brand.muted, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
                }
                application.reference?.let {
                    Text(
                        "PrcPay ref $it",
                        color = Brand.muted,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 3.dp)
                    )
                }
                application.reviewNote?.let {
                    Text(
                        "Control room: $it",
                        color = Brand.muted,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 3.dp)
                    )
                }

                if (!application.feePaid && application.status == "pending") {
                    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Chip(
                            if (paying == application.id) "Close" else "Pay with PrcPay",
                            paying == application.id
                        ) {
                            paying = if (paying == application.id) null else application.id
                            error = null
                            notice = null
                        }
                    }
                }

                if (paying == application.id) {
                    Spacer(Modifier.height(10.dp))
                    Line()
                    Text(
                        "The charge is taken from the PrcPay account you name and settles at once — the fee is " +
                            "marked paid the moment the payment returns.",
                        color = Brand.muted,
                        fontSize = 11.5.sp,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    TextInput(account, { account = it }, "PrcPay account")
                    TextInput(currency, { currency = it.uppercase() }, "Currency (any PrcPay currency except PRCP)")
                    Row(
                        Modifier.padding(top = 2.dp).horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        CURRENCIES.forEach { code -> Chip(code, currency == code) { currency = code } }
                    }
                    Spacer(Modifier.height(8.dp))
                    PrimaryButton(
                        if (busy) "Paying…" else "Pay ${licenceMoney(application.feeCents)} with PrcPay",
                        enabled = !busy && prcpayOn
                    ) { pay(application) }
                    if (!prcpayOn) {
                        Text(
                            "PrcPay is not switched on for this platform yet.",
                            color = Brand.muted,
                            fontSize = 11.5.sp,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            }
        }
    }
}
