package app.glide

import app.glide.data.RawSms
import app.glide.data.SmsAnalyzer
import app.glide.data.SmsParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * These tests carry the whole Android argument: that a month of raw inbox
 * becomes a correctly segregated ledger, and that non-transactional noise
 * never enters it.
 */
class SmsParserTest {

    private val now = System.currentTimeMillis()
    private fun day(n: Int) = now - n * 86_400_000L

    // --- extraction ---------------------------------------------------------

    @Test
    fun `parses an HDFC UPI debit`() {
        val parsed = SmsParser.parse(
            "Rs.12,000.00 debited from A/c XX4521 on 03-08-2026 to SURESH KUMAR LANDLORD. " +
                "UPI Ref 447281930022. Avl Bal Rs.27,000.00. -HDFC Bank",
            "VM-HDFCBK", now,
        )
        assertNotNull(parsed)
        assertEquals(12000.0, parsed!!.amount, 0.001)
        assertEquals("DEBIT", parsed.direction)
        assertEquals("SURESH KUMAR LANDLORD", parsed.merchant)
        assertEquals("Rent", parsed.category)
        assertEquals("UPI", parsed.channel)
        assertTrue("well-formed alerts should score high", parsed.confidence > 0.9)
    }

    @Test
    fun `parses an SBI credit and keeps the full payer name`() {
        // Regression: a word-boundary-less "to" pattern used to match inside
        // "ZOMATO" and truncate the payer to "PARTNER PAYOUT".
        val parsed = SmsParser.parse(
            "Your A/c XX4521 has been credited with Rs.6,592.80 on 28-08-2026 from " +
                "ZOMATO PARTNER PAYOUT. UPI Ref 123456789012. Bal: Rs.39,427.15. -SBI",
            "JD-SBIINB", now,
        )
        assertNotNull(parsed)
        assertEquals("CREDIT", parsed!!.direction)
        assertEquals("ZOMATO PARTNER PAYOUT", parsed.merchant)
        assertEquals("Income", parsed.category)
    }

    @Test
    fun `parses a Paytm payment and strips the trailing clause`() {
        val parsed = SmsParser.parse(
            "Payment of Rs.199.00 to SPOTIFY INDIA is successful on 18-08-2026. " +
                "UPI transaction ID 196777561202. -Paytm",
            "VK-PAYTMB", now,
        )
        assertNotNull(parsed)
        assertEquals("SPOTIFY INDIA", parsed!!.merchant)
        assertEquals("Entertainment", parsed.category)
    }

    @Test
    fun `does not mistake available for a health keyword`() {
        // Regression: substring matching made "avai(lab)le" hit the "lab" rule.
        val parsed = SmsParser.parse(
            "INR 10,550.00 credited to A/c no. XX4521 on 25-08-2026. Info: NEFT-ACME DESIGN " +
                "STUDIO. Available balance INR 39,407.00. -ICICI Bank",
            "AD-ICICIB", now,
        )
        assertNotNull(parsed)
        assertEquals("Income", parsed!!.category)
        assertEquals("NEFT-ACME DESIGN STUDIO", parsed.merchant)
    }

    // --- rejection ----------------------------------------------------------

    @Test
    fun `rejects OTP promotional reminder and failed messages`() {
        val noise = listOf(
            "Your OTP for HDFC Bank transaction is 883421. Do not share this with anyone." to "VM-HDFCBK",
            "Get 50% OFF on your next Swiggy order! Use code SAVE50. Click here bit.ly/xyz" to "AD-PROMO",
            "Reminder: Your Airtel bill of Rs.799 is due on 28-08-2026. Kindly pay to avoid disruption." to "AD-AIRTEL",
            "Transaction of Rs.2,500 at AMAZON has FAILED. Amount will be reversed. -HDFC Bank" to "VM-HDFCBK",
            "Congratulations! You are eligible for a pre-approved loan of Rs.5,00,000. Apply now!" to "AD-LOANS",
        )
        noise.forEach { (body, sender) ->
            assertNull("should have rejected: $body", SmsParser.parse(body, sender, now))
        }
    }

    // --- end-to-end segregation --------------------------------------------

    @Test
    fun `segregates a month of inbox into categories income and obligations`() {
        val inbox = buildList {
            // Rent, three months running -> should be discovered as recurring.
            listOf(3, 33, 63).forEach { d ->
                add(RawSms("Rs.12,000.00 debited from A/c XX4521 to SURESH KUMAR LANDLORD. UPI Ref 11$d. Avl Bal Rs.20,000.00. -HDFC Bank", "VM-HDFCBK", day(d)))
            }
            // A subscription at a steady amount.
            listOf(6, 36, 66).forEach { d ->
                add(RawSms("Payment of Rs.649.00 to NETFLIX INDIA is successful. UPI transaction ID 22$d. -Paytm", "VK-PAYTMB", day(d)))
            }
            // Irregular gig income.
            listOf(2 to 8400.0, 14 to 15200.0, 27 to 6100.0).forEach { (d, amount) ->
                add(RawSms("Your A/c XX4521 has been credited with Rs.$amount from UPWORK ESCROW. UPI Ref 33$d. Bal: Rs.40,000.00. -SBI", "JD-SBIINB", day(d)))
            }
            // Discretionary noise at varying amounts -- must NOT become an obligation.
            listOf(1 to 240.0, 4 to 815.0, 9 to 130.0, 12 to 460.0, 19 to 1290.0).forEach { (d, amount) ->
                add(RawSms("Rs.$amount debited from A/c XX4521 to SWIGGY. UPI Ref 44$d. Avl Bal Rs.18,000.00. -HDFC Bank", "VM-HDFCBK", day(d)))
            }
            // Noise that must be filtered out entirely.
            add(RawSms("Your OTP for HDFC Bank transaction is 100200. Do not share.", "VM-HDFCBK", day(2)))
            add(RawSms("FLAT 60% OFF this weekend only! Click here to shop now.", "AD-PROMO", day(5)))
        }

        val result = SmsAnalyzer.analyze(inbox, windowDays = 90)

        // Every genuine alert parsed; both noise messages rejected.
        assertEquals(14, result.parsed)
        assertEquals(2, result.rejected)

        // Direction split.
        assertEquals(29700.0, result.totalIn, 0.01)
        assertEquals(3 * 12000.0 + 3 * 649.0 + 2935.0, result.totalOut, 0.01)

        // Category segregation.
        val categories = result.categories.associate { it.category to it.amount }
        assertEquals(36000.0, categories["Rent"] ?: 0.0, 0.01)
        assertEquals(1947.0, categories["Entertainment"] ?: 0.0, 0.01)
        assertEquals(2935.0, categories["Food"] ?: 0.0, 0.01)

        // Rent is essential, Swiggy is not.
        assertTrue(result.categories.first { it.category == "Rent" }.essential)
        assertTrue(!result.categories.first { it.category == "Food" }.essential)

        // Recurring discovery: rent and Netflix, but never the variable Swiggy orders.
        val obligationNames = result.obligations.map { it.name }
        assertTrue("rent should be discovered", obligationNames.any { it.contains("SURESH") })
        assertTrue("netflix should be discovered", obligationNames.any { it.contains("NETFLIX") })
        assertTrue("variable takeaway must not be an obligation", obligationNames.none { it.contains("SWIGGY") })

        // Confidence rises with repeats.
        val rent = result.obligations.first { it.name.contains("SURESH") }
        assertEquals(30, rent.cadenceDays)
        assertEquals(3, rent.occurrences)
        assertTrue("three repeats should read as confident", rent.confidence > 0.65)

        // Income is reported as a band, never a single number.
        assertTrue(result.income.p10 < result.income.p50)
        assertTrue(result.income.p50 < result.income.p90)
        assertEquals(3, result.income.depositCount)
    }

    @Test
    fun `collapses duplicate alerts for the same payment`() {
        // Banks often send both a debit alert and a UPI confirmation.
        val inbox = listOf(
            RawSms("Rs.2,499.00 debited from A/c XX4521 to AMAZON PAY INDIA. UPI Ref 991. Avl Bal Rs.10,000.00. -HDFC Bank", "VM-HDFCBK", day(2)),
            RawSms("Payment of Rs.2,499.00 to AMAZON PAY INDIA is successful. UPI transaction ID 992. -Paytm", "VK-PAYTMB", day(2) + 3_600_000L),
        )
        val result = SmsAnalyzer.analyze(inbox, windowDays = 30)
        assertEquals("the same purchase must be booked once", 1, result.parsed)
        assertEquals(2499.0, result.totalOut, 0.01)
    }
}
